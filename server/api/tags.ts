import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv } from "../env";
import { getDb, groceryTags, eq, and, sql } from "@amigo/db";
import { broadcastToHousehold } from "../lib/realtime";
import { ActionError } from "../lib/errors";

const TAG_COLORS = [
  "blue", "red", "green", "yellow", "purple", "pink", "orange", "gray",
] as const;

const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.enum(TAG_COLORS).optional(),
});

const updateTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.enum(TAG_COLORS),
});

export const tagsRoute = new Hono<HonoEnv>();

// List tags
tagsRoute.get("/", async (c) => {
  const session = c.get("appSession");
  const db = getDb(c.env.DB);

  const tags = await db.query.groceryTags.findMany({
    where: eq(groceryTags.householdId, session.householdId),
    orderBy: (tags, { asc }) => [asc(tags.name)],
  });

  return c.json(tags);
});

// Create tag
tagsRoute.post("/", async (c) => {
  const session = c.get("appSession");
  const body = await c.req.json();
  const validated = createTagSchema.parse(body);
  const db = getDb(c.env.DB);
  const trimmedName = validated.name.trim();

  // Return existing tag if name matches (case-insensitive)
  const existingTag = await db.query.groceryTags.findFirst({
    where: and(
      eq(groceryTags.householdId, session.householdId),
      sql`lower(${groceryTags.name}) = lower(${trimmedName})`
    ),
  });

  if (existingTag) {
    return c.json(existingTag);
  }

  const tag = await db
    .insert(groceryTags)
    .values({
      householdId: session.householdId,
      name: trimmedName,
      color: validated.color ?? "blue",
    })
    .returning()
    .get();

  await broadcastToHousehold(c.env, session.householdId, {
    type: "GROCERY_UPDATE",
    action: "tag_create",
  });

  return c.json(tag, 201);
});

// Update tag
tagsRoute.patch("/:id", async (c) => {
  const session = c.get("appSession");
  const id = c.req.param("id");
  const body = await c.req.json();
  const validated = updateTagSchema.parse(body);
  const db = getDb(c.env.DB);
  const trimmedName = validated.name.trim();

  const existing = await db.query.groceryTags.findFirst({
    where: and(
      eq(groceryTags.id, id),
      eq(groceryTags.householdId, session.householdId)
    ),
  });

  if (!existing) {
    throw new ActionError("Tag not found", "NOT_FOUND");
  }

  // Check for duplicate name
  const duplicate = await db.query.groceryTags.findFirst({
    where: and(
      eq(groceryTags.householdId, session.householdId),
      sql`lower(${groceryTags.name}) = lower(${trimmedName})`,
      sql`${groceryTags.id} != ${id}`
    ),
  });

  if (duplicate) {
    throw new ActionError("A tag with this name already exists", "VALIDATION_ERROR");
  }

  const updated = await db
    .update(groceryTags)
    .set({ name: trimmedName, color: validated.color })
    .where(
      and(eq(groceryTags.id, id), eq(groceryTags.householdId, session.householdId))
    )
    .returning()
    .get();

  await broadcastToHousehold(c.env, session.householdId, {
    type: "GROCERY_UPDATE",
    action: "tag_update",
  });

  return c.json(updated);
});

// Delete tag
tagsRoute.delete("/:id", async (c) => {
  const session = c.get("appSession");
  const id = c.req.param("id");
  const db = getDb(c.env.DB);

  const deleted = await db
    .delete(groceryTags)
    .where(
      and(eq(groceryTags.id, id), eq(groceryTags.householdId, session.householdId))
    )
    .returning()
    .get();

  if (!deleted) {
    throw new ActionError("Tag not found", "NOT_FOUND");
  }

  await broadcastToHousehold(c.env, session.householdId, {
    type: "GROCERY_UPDATE",
    action: "tag_delete",
  });

  return c.json(deleted);
});
