import {
  and,
  eq,
  getDb,
  groceryItems,
  groceryItemTags,
  grocerySyncMutations,
  groceryTags,
  inArray,
  isNull,
  scopeToHousehold,
} from "@amigo/db";
import { z } from "zod";
import { broadcastToHousehold } from "../lib/realtime";
import { logServerError } from "../lib/errors";
import { withAudit } from "../lib/audit";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import type { ApiHandler } from "./route";
import { GROCERY_SYNC_MUTATION_RETENTION_MS } from "../../app/lib/offline/sync-retention";

const MAX_BATCH_SIZE = 10;
const GROCERY_SYNC_MUTATION_CLEANUP_BATCH_SIZE = 500;

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

export const handleSyncRequest: ApiHandler = async ({
  env,
  request,
  session,
}) => {
  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  await enforceRateLimit(
    env,
    `${session!.userId}:sync`,
    ROUTE_RATE_LIMITS.sync.batch
  );

  const validated = batchSyncSchema.parse(await request.json());
  const db = getDb(env.DB);
  const results: MutationResult[] = [];
  let processedCount = 0;

  for (const mutation of validated.mutations) {
    try {
      const serverItem = await processMutation(db, session!, mutation);
      results.push({
        id: mutation.id,
        success: true,
        serverItem: serverItem ?? undefined,
      });
      processedCount++;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logServerError(
        "sync",
        error instanceof Error ? error : new Error(errorMessage),
        {
          mutationId: mutation.id,
          operation: mutation.operation,
        }
      );
      results.push({
        id: mutation.id,
        success: false,
        error: errorMessage,
      });
    }
  }

  if (processedCount > 0) {
    await broadcastToHousehold(
      env,
      session!.householdId,
      {
        type: "GROCERY_UPDATE",
        action: "bulk_sync",
        count: processedCount,
      },
      session!.userId
    );
  }

  return Response.json({
    processed: processedCount,
    failed: validated.mutations.length - processedCount,
    results,
  });
};

async function loadGroceryItemForIdempotentAdd(
  db: ReturnType<typeof getDb>,
  householdId: string,
  itemId: string
): Promise<Record<string, unknown>> {
  const item = await db.query.groceryItems.findFirst({
    where: and(
      eq(groceryItems.id, itemId),
      scopeToHousehold(groceryItems.householdId, householdId)
    ),
  });

  if (!item) {
    throw new Error("Item not found");
  }

  return item as unknown as Record<string, unknown>;
}

export async function cleanupStaleGrocerySyncMutations(
  env: { DB: D1Database }
): Promise<{ deletedCount: number }> {
  const cutoff = Date.now() - GROCERY_SYNC_MUTATION_RETENTION_MS;
  let deletedCount = 0;

  while (true) {
    const result = await env.DB.prepare(
      `DELETE FROM grocery_sync_mutations
       WHERE rowid IN (
         SELECT rowid FROM grocery_sync_mutations
         WHERE created_at < ?
         LIMIT ?
       )`
    )
      .bind(cutoff, GROCERY_SYNC_MUTATION_CLEANUP_BATCH_SIZE)
      .run();

    const changes = result.meta.changes ?? 0;
    deletedCount += changes;
    if (changes < GROCERY_SYNC_MUTATION_CLEANUP_BATCH_SIZE) break;
  }

  return { deletedCount };
}

async function resolveIdempotentAdd(
  db: ReturnType<typeof getDb>,
  session: { householdId: string },
  mutationId: string
): Promise<Record<string, unknown> | null> {
  const existing = await db.query.grocerySyncMutations.findFirst({
    where: and(
      eq(grocerySyncMutations.id, mutationId),
      scopeToHousehold(grocerySyncMutations.householdId, session.householdId)
    ),
  });

  if (!existing) return null;
  return loadGroceryItemForIdempotentAdd(
    db,
    session.householdId,
    existing.groceryItemId
  );
}

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

      // Idempotent replay: do not write a second INSERT audit.
      const existingItem = await resolveIdempotentAdd(db, session, mutation.id);
      if (existingItem) {
        return existingItem;
      }

      const normalizedTagIds = Array.isArray(tagIds)
        ? Array.from(
            new Set(tagIds.filter((id): id is string => typeof id === "string"))
          )
        : [];

      let validTags: Array<{ id: string }> = [];
      if (normalizedTagIds.length > 0) {
        validTags = await db.query.groceryTags.findMany({
          where: and(
            inArray(groceryTags.id, normalizedTagIds),
            scopeToHousehold(groceryTags.householdId, session.householdId)
          ),
        });
        if (validTags.length !== normalizedTagIds.length) {
          throw new Error("One or more tags are invalid for this household");
        }
      }

      const newItemId = crypto.randomUUID();
      const writes = [
        db.insert(groceryItems).values({
          id: newItemId,
          householdId: session.householdId,
          createdByUserId: session.userId,
          itemName: name.trim().slice(0, 255),
          category: category?.trim().slice(0, 100) || "General",
        }),
        ...(validTags.length > 0
          ? [
              db.insert(groceryItemTags).values(
                validTags.map((tag) => ({ itemId: newItemId, tagId: tag.id }))
              ),
            ]
          : []),
        db.insert(grocerySyncMutations).values({
          id: mutation.id,
          householdId: session.householdId,
          groceryItemId: newItemId,
        }),
      ];

      try {
        await db.batch(writes as unknown as Parameters<typeof db.batch>[0]);
      } catch (error) {
        const raced = await resolveIdempotentAdd(db, session, mutation.id);
        if (raced) return raced;
        throw error;
      }

      const created = await loadGroceryItemForIdempotentAdd(
        db,
        session.householdId,
        newItemId
      );

      // Audit after successful write (mirrors groceries REST create).
      await withAudit(
        db,
        {
          householdId: session.householdId,
          tableName: "grocery_items",
          recordId: newItemId,
          operation: "INSERT",
          newValues: created,
          changedBy: session.userId,
        },
        async () => created
      );

      return created;
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

      const updated = await withAudit(
        db,
        {
          householdId: session.householdId,
          tableName: "grocery_items",
          recordId: mutation.entityId,
          operation: "UPDATE",
          oldValues: existing,
          newValues: (result) => result,
          changedBy: session.userId,
        },
        async () => {
          const result = await db
            .update(groceryItems)
            .set({
              isPurchased: !existing.isPurchased,
              purchasedAt: existing.isPurchased ? null : new Date(),
            })
            .where(
              and(
                eq(groceryItems.id, mutation.entityId),
                scopeToHousehold(groceryItems.householdId, session.householdId),
                isNull(groceryItems.deletedAt)
              )
            )
            .returning()
            .get();
          if (!result) throw new Error("Item not found");
          return result;
        }
      );

      return updated as unknown as Record<string, unknown>;
    }

    case "delete": {
      const existing = await db.query.groceryItems.findFirst({
        where: and(
          eq(groceryItems.id, mutation.entityId),
          scopeToHousehold(groceryItems.householdId, session.householdId),
          isNull(groceryItems.deletedAt)
        ),
      });

      if (!existing) throw new Error("Item not found");

      const deleted = await withAudit(
        db,
        {
          householdId: session.householdId,
          tableName: "grocery_items",
          recordId: mutation.entityId,
          operation: "DELETE",
          oldValues: existing,
          changedBy: session.userId,
        },
        async () => {
          const result = await db
            .update(groceryItems)
            .set({ deletedAt: new Date() })
            .where(
              and(
                eq(groceryItems.id, mutation.entityId),
                scopeToHousehold(groceryItems.householdId, session.householdId),
                isNull(groceryItems.deletedAt)
              )
            )
            .returning()
            .get();
          if (!result) throw new Error("Item not found");
          return result;
        }
      );

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

      const priorTags = await db.query.groceryItemTags.findMany({
        where: eq(groceryItemTags.itemId, mutation.entityId),
      });
      const priorTagIds = priorTags.map((row) => row.tagId);

      let validTagIds: string[] = [];
      if (tagIds.length > 0) {
        const validTags = await db.query.groceryTags.findMany({
          where: and(
            inArray(groceryTags.id, tagIds),
            scopeToHousehold(groceryTags.householdId, session.householdId)
          ),
        });
        if (validTags.length !== tagIds.length) {
          throw new Error("One or more tags are invalid for this household");
        }
        validTagIds = validTags.map((t) => t.id);
      }

      await withAudit(
        db,
        {
          householdId: session.householdId,
          tableName: "grocery_items",
          recordId: mutation.entityId,
          operation: "UPDATE",
          oldValues: { ...existing, tagIds: priorTagIds },
          newValues: { ...existing, tagIds: validTagIds },
          changedBy: session.userId,
        },
        async () => {
          // Reject if the item was soft-deleted after the initial read.
          const stillActive = await db
            .select({ id: groceryItems.id })
            .from(groceryItems)
            .where(
              and(
                eq(groceryItems.id, mutation.entityId),
                scopeToHousehold(groceryItems.householdId, session.householdId),
                isNull(groceryItems.deletedAt)
              )
            )
            .get();
          if (!stillActive) throw new Error("Item not found");

          await db.batch([
            db
              .delete(groceryItemTags)
              .where(eq(groceryItemTags.itemId, mutation.entityId)),
            ...(validTagIds.length > 0
              ? [
                  db.insert(groceryItemTags).values(
                    validTagIds.map((tagId) => ({
                      itemId: mutation.entityId,
                      tagId,
                    }))
                  ),
                ]
              : []),
          ]);
          return existing;
        }
      );

      return null;
    }

    default: {
      const _exhaustive: never = mutation.operation;
      throw new Error(`Unknown operation: ${_exhaustive}`);
    }
  }
}
