import {
  and,
  budgetCategoryMappings,
  eq,
  financialCategories,
  getDb,
  isNull,
  scopeToHousehold,
} from "@amigo/db";
import { z } from "zod";
import { ActionError } from "../lib/errors";
import {
  categoryHasUsage,
  findDuplicateCategoryName,
  listCategoryBudgetMappings,
  listFinancialCategories,
  upsertCategoryBudgetMappings,
  validateCategoryParent,
} from "../lib/financial-categories";
import { seedStarterFinancialCategories } from "@amigo/db";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { getSplatSegments, type ApiHandler } from "./route";

const trimmedNameSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().min(1).max(100)
);

const createCategorySchema = z.object({
  name: trimmedNameSchema,
  type: z.enum(["income", "expense"]),
  parentId: z.string().uuid().nullable().optional(),
  icon: z.string().max(16).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

const updateCategorySchema = z.object({
  name: trimmedNameSchema.optional(),
  icon: z.string().max(16).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  archived: z.boolean().optional(),
});

const mappingsSchema = z.object({
  mappings: z.array(
    z.object({
      categoryId: z.string().uuid(),
      budgetId: z.string().uuid().nullable(),
    })
  ),
});

export const handleCategoriesRequest: ApiHandler = async ({
  env,
  params,
  request,
  session,
}) => {
  const [path] = getSplatSegments(params);
  const id =
    path && path !== "mappings" ? path : undefined;
  const db = getDb(env.DB);
  const householdId = session!.householdId;

  await seedStarterFinancialCategories(db, householdId);

  if (request.method === "GET" && !path) {
    await enforceRateLimit(
      env,
      `${session!.userId}:categories:list`,
      ROUTE_RATE_LIMITS.categories.list
    );

    const includeArchived =
      new URL(request.url).searchParams.get("includeArchived") === "true";
    const categories = await listFinancialCategories(db, householdId, {
      includeArchived,
    });
    return Response.json(categories);
  }

  if (request.method === "GET" && path === "mappings") {
    await enforceRateLimit(
      env,
      `${session!.userId}:categories:mappings:list`,
      ROUTE_RATE_LIMITS.categories.mappingsList
    );

    const mappings = await listCategoryBudgetMappings(db, householdId);
    return Response.json({ mappings });
  }

  if (request.method === "PUT" && path === "mappings") {
    await enforceRateLimit(
      env,
      `${session!.userId}:categories:mappings:update`,
      ROUTE_RATE_LIMITS.categories.mappingsUpdate
    );

    const validated = mappingsSchema.parse(await request.json());
    await upsertCategoryBudgetMappings(
      db,
      householdId,
      session!.userId,
      validated.mappings
    );
    return Response.json({ ok: true });
  }

  if (request.method === "POST" && !path) {
    await enforceRateLimit(
      env,
      `${session!.userId}:categories:create`,
      ROUTE_RATE_LIMITS.categories.create
    );

    const validated = createCategorySchema.parse(await request.json());
    const parentId = validated.parentId ?? null;

    if (parentId) {
      await validateCategoryParent(db, householdId, parentId, validated.type);
    }

    const duplicate = await findDuplicateCategoryName(
      db,
      householdId,
      validated.name,
      parentId
    );
    if (duplicate) {
      throw new ActionError(
        "A category with this name already exists",
        "VALIDATION_ERROR"
      );
    }

    const category = await db
      .insert(financialCategories)
      .values({
        householdId,
        parentId,
        name: validated.name.trim(),
        type: validated.type,
        icon: validated.icon ?? null,
        sortOrder: validated.sortOrder ?? 0,
      })
      .returning()
      .get();

    return Response.json(
      { ...category, hasChildren: false, selectable: true },
      { status: 201 }
    );
  }

  if (request.method === "PATCH" && id) {
    await enforceRateLimit(
      env,
      `${session!.userId}:categories:update`,
      ROUTE_RATE_LIMITS.categories.update
    );

    const validated = updateCategorySchema.parse(await request.json());
    const existing = await db.query.financialCategories.findFirst({
      where: and(
        eq(financialCategories.id, id),
        scopeToHousehold(financialCategories.householdId, householdId),
        isNull(financialCategories.deletedAt)
      ),
    });

    if (!existing) {
      throw new ActionError("Category not found", "NOT_FOUND");
    }

    if (validated.name !== undefined) {
      const duplicate = await findDuplicateCategoryName(
        db,
        householdId,
        validated.name,
        existing.parentId,
        id
      );
      if (duplicate) {
        throw new ActionError(
          "A category with this name already exists",
          "VALIDATION_ERROR"
        );
      }
    }

    const updated = await db
      .update(financialCategories)
      .set({
        ...(validated.name !== undefined ? { name: validated.name.trim() } : {}),
        ...(validated.icon !== undefined ? { icon: validated.icon } : {}),
        ...(validated.sortOrder !== undefined
          ? { sortOrder: validated.sortOrder }
          : {}),
        ...(validated.archived !== undefined
          ? { archived: validated.archived }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financialCategories.id, id),
          scopeToHousehold(financialCategories.householdId, householdId)
        )
      )
      .returning()
      .get();

    if (!updated) {
      throw new ActionError("Category not found", "NOT_FOUND");
    }

    if (validated.archived === true) {
      await db
        .update(financialCategories)
        .set({ archived: true, updatedAt: new Date() })
        .where(
          and(
            eq(financialCategories.parentId, id),
            scopeToHousehold(financialCategories.householdId, householdId)
          )
        );
    }

    return Response.json(updated);
  }

  if (request.method === "DELETE" && id) {
    await enforceRateLimit(
      env,
      `${session!.userId}:categories:delete`,
      ROUTE_RATE_LIMITS.categories.delete
    );

    const existing = await db.query.financialCategories.findFirst({
      where: and(
        eq(financialCategories.id, id),
        scopeToHousehold(financialCategories.householdId, householdId),
        isNull(financialCategories.deletedAt)
      ),
    });

    if (!existing) {
      throw new ActionError("Category not found", "NOT_FOUND");
    }

    const childRows = await db.query.financialCategories.findMany({
      where: and(
        eq(financialCategories.parentId, id),
        scopeToHousehold(financialCategories.householdId, householdId),
        isNull(financialCategories.deletedAt)
      ),
    });
    const ids = [id, ...childRows.map((row) => row.id)];
    const hasUsage = await categoryHasUsage(db, householdId, ids);

    if (hasUsage) {
      await db
        .update(financialCategories)
        .set({ archived: true, updatedAt: new Date() })
        .where(
          and(
            scopeToHousehold(financialCategories.householdId, householdId),
            eq(financialCategories.parentId, id)
          )
        );
      const archived = await db
        .update(financialCategories)
        .set({ archived: true, updatedAt: new Date() })
        .where(
          and(
            eq(financialCategories.id, id),
            scopeToHousehold(financialCategories.householdId, householdId)
          )
        )
        .returning()
        .get();
      return Response.json(archived);
    }

    await db
      .delete(budgetCategoryMappings)
      .where(
        and(
          scopeToHousehold(budgetCategoryMappings.householdId, householdId),
          eq(budgetCategoryMappings.categoryId, id)
        )
      );

    if (childRows.length > 0) {
      await db
        .delete(financialCategories)
        .where(
          and(
            eq(financialCategories.parentId, id),
            scopeToHousehold(financialCategories.householdId, householdId)
          )
        );
    }

    const deleted = await db
      .delete(financialCategories)
      .where(
        and(
          eq(financialCategories.id, id),
          scopeToHousehold(financialCategories.householdId, householdId)
        )
      )
      .returning()
      .get();

    return Response.json(deleted);
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, PUT, PATCH, DELETE" },
  });
};
