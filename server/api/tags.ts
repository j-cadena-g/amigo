import { and, eq, getDb, groceryTags, sql } from "@amigo/db";
import { z } from "zod";
import { broadcastToHousehold } from "../lib/realtime";
import { ActionError } from "../lib/errors";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { getSplatSegments, type ApiHandler } from "./route";

const TAG_COLORS = [
  "blue",
  "red",
  "green",
  "yellow",
  "purple",
  "pink",
  "orange",
  "gray",
] as const;

const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.enum(TAG_COLORS).optional(),
});

const updateTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.enum(TAG_COLORS),
});

export const handleTagsRequest: ApiHandler = async ({
  env,
  params,
  request,
  session,
}) => {
  const [id] = getSplatSegments(params);
  const db = getDb(env.DB);

  if (request.method === "GET" && !id) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:tags:list`,
      ROUTE_RATE_LIMITS.tags.list
    );

    const tags = await db.query.groceryTags.findMany({
      where: eq(groceryTags.householdId, session!.householdId),
      orderBy: (tag, { asc }) => [asc(tag.name)],
    });

    return Response.json(tags);
  }

  if (request.method === "POST" && !id) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:tags:create`,
      ROUTE_RATE_LIMITS.tags.create
    );

    const validated = createTagSchema.parse(await request.json());
    const trimmedName = validated.name.trim();

    const existingTag = await db.query.groceryTags.findFirst({
      where: and(
        eq(groceryTags.householdId, session!.householdId),
        sql`lower(${groceryTags.name}) = lower(${trimmedName})`
      ),
    });

    if (existingTag) {
      return Response.json(existingTag);
    }

    const tag = await db
      .insert(groceryTags)
      .values({
        householdId: session!.householdId,
        name: trimmedName,
        color: validated.color ?? "blue",
      })
      .returning()
      .get();

    await broadcastToHousehold(env, session!.householdId, {
      type: "GROCERY_UPDATE",
      action: "tag_create",
    });

    return Response.json(tag, { status: 201 });
  }

  if (request.method === "PATCH" && id) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:tags:update`,
      ROUTE_RATE_LIMITS.tags.update
    );

    const validated = updateTagSchema.parse(await request.json());
    const trimmedName = validated.name.trim();

    const existing = await db.query.groceryTags.findFirst({
      where: and(
        eq(groceryTags.id, id),
        eq(groceryTags.householdId, session!.householdId)
      ),
    });

    if (!existing) {
      throw new ActionError("Tag not found", "NOT_FOUND");
    }

    const duplicate = await db.query.groceryTags.findFirst({
      where: and(
        eq(groceryTags.householdId, session!.householdId),
        sql`lower(${groceryTags.name}) = lower(${trimmedName})`,
        sql`${groceryTags.id} != ${id}`
      ),
    });

    if (duplicate) {
      throw new ActionError(
        "A tag with this name already exists",
        "VALIDATION_ERROR"
      );
    }

    const updated = await db
      .update(groceryTags)
      .set({ name: trimmedName, color: validated.color })
      .where(
        and(
          eq(groceryTags.id, id),
          eq(groceryTags.householdId, session!.householdId)
        )
      )
      .returning()
      .get();

    await broadcastToHousehold(env, session!.householdId, {
      type: "GROCERY_UPDATE",
      action: "tag_update",
    });

    return Response.json(updated);
  }

  if (request.method === "DELETE" && id) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:tags:delete`,
      ROUTE_RATE_LIMITS.tags.delete
    );

    const deleted = await db
      .delete(groceryTags)
      .where(
        and(
          eq(groceryTags.id, id),
          eq(groceryTags.householdId, session!.householdId)
        )
      )
      .returning()
      .get();

    if (!deleted) {
      throw new ActionError("Tag not found", "NOT_FOUND");
    }

    await broadcastToHousehold(env, session!.householdId, {
      type: "GROCERY_UPDATE",
      action: "tag_delete",
    });

    return Response.json(deleted);
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, PATCH, DELETE" },
  });
};
