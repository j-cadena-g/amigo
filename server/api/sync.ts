import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv } from "../env";
import { getDb, groceryItems, groceryItemTags, scopeToHousehold, eq, and, isNull } from "@amigo/db";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { broadcastToHousehold } from "../lib/realtime";
import { logServerError } from "../lib/errors";

const MAX_BATCH_SIZE = 10;

const syncMutationSchema = z.object({
  id: z.string(),
  operation: z.enum(["add", "toggle", "delete", "updateTags"]),
  entityType: z.enum(["groceryItem", "groceryTag"]),
  entityId: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

const batchSyncSchema = z.object({
  mutations: z.array(syncMutationSchema).max(MAX_BATCH_SIZE),
});

interface MutationResult {
  id: string;
  success: boolean;
  serverItem?: Record<string, unknown>;
  error?: string;
}

export const syncRoute = new Hono<HonoEnv>();

syncRoute.post("/", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(c.env.CACHE, `${session.userId}:sync`, ROUTE_RATE_LIMITS.sync.batch);

  const body = await c.req.json();
  const validated = batchSyncSchema.parse(body);

  const db = getDb(c.env.DB);
  const results: MutationResult[] = [];
  let processedCount = 0;

  for (const mutation of validated.mutations) {
    try {
      const serverItem = await processMutation(db, session, mutation);
      results.push({
        id: mutation.id,
        success: true,
        serverItem: serverItem ?? undefined,
      });
      processedCount++;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logServerError("sync", error instanceof Error ? error : new Error(errorMessage), {
        mutationId: mutation.id,
        operation: mutation.operation,
      });
      results.push({
        id: mutation.id,
        success: false,
        error: errorMessage,
      });
    }
  }

  // Single broadcast after all mutations
  if (processedCount > 0) {
    await broadcastToHousehold(
      c.env,
      session.householdId,
      {
        type: "GROCERY_UPDATE",
        action: "bulk_sync",
        count: processedCount,
      },
      session.userId
    );
  }

  return c.json({
    processed: processedCount,
    failed: validated.mutations.length - processedCount,
    results,
  });
});

async function processMutation(
  db: ReturnType<typeof getDb>,
  session: { userId: string; householdId: string },
  mutation: z.infer<typeof syncMutationSchema>
): Promise<Record<string, unknown> | null> {
  switch (mutation.operation) {
    case "add": {
      const { name, category, tagIds } = mutation.payload as {
        name?: string;
        category?: string;
        tagIds?: string[];
      };

      if (!name || typeof name !== "string") {
        throw new Error("Item name is required");
      }

      const item = await db
        .insert(groceryItems)
        .values({
          householdId: session.householdId,
          createdByUserId: session.userId,
          itemName: name.trim().slice(0, 255),
          category: category?.trim().slice(0, 100) || "General",
        })
        .returning()
        .get();

      if (!item) throw new Error("Insert returned empty result");

      if (tagIds && tagIds.length > 0) {
        await db.insert(groceryItemTags).values(
          tagIds.map((tagId) => ({ itemId: item.id, tagId }))
        );
      }

      return item as unknown as Record<string, unknown>;
    }

    case "toggle": {
      const existing = await db.query.groceryItems.findFirst({
        where: and(
          eq(groceryItems.id, mutation.entityId),
          scopeToHousehold(groceryItems.householdId, session.householdId),
          isNull(groceryItems.deletedAt)
        ),
      });

      if (!existing) throw new Error("Item not found");

      const updated = await db
        .update(groceryItems)
        .set({
          isPurchased: !existing.isPurchased,
          purchasedAt: existing.isPurchased ? null : new Date(),
        })
        .where(
          and(
            eq(groceryItems.id, mutation.entityId),
            scopeToHousehold(groceryItems.householdId, session.householdId)
          )
        )
        .returning()
        .get();

      return updated as unknown as Record<string, unknown>;
    }

    case "delete": {
      const deleted = await db
        .update(groceryItems)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(groceryItems.id, mutation.entityId),
            scopeToHousehold(groceryItems.householdId, session.householdId)
          )
        )
        .returning()
        .get();

      return deleted as unknown as Record<string, unknown>;
    }

    case "updateTags": {
      const { tagIds } = mutation.payload as { tagIds?: string[] };
      if (!tagIds) throw new Error("tagIds required");

      const existing = await db.query.groceryItems.findFirst({
        where: and(
          eq(groceryItems.id, mutation.entityId),
          scopeToHousehold(groceryItems.householdId, session.householdId),
          isNull(groceryItems.deletedAt)
        ),
      });

      if (!existing) throw new Error("Item not found");

      await db.batch([
        db.delete(groceryItemTags).where(eq(groceryItemTags.itemId, mutation.entityId)),
        ...(tagIds.length > 0
          ? [
              db.insert(groceryItemTags).values(
                tagIds.map((tagId) => ({ itemId: mutation.entityId, tagId }))
              ),
            ]
          : []),
      ]);

      return null;
    }

    default:
      throw new Error(`Unknown operation: ${mutation.operation}`);
  }
}
