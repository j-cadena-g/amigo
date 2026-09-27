import { beforeEach, describe, expect, it } from "vitest";
import { eq, groceryTags } from "@amigo/db";
import { handleTagsRequest } from "./tags";
import { createTestDb, seedHouseholdWithOwner, testSession } from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

describe("tags integration", () => {
  let householdId: string;
  let ownerId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-tags-${suffix}`;
    ownerId = `user-tags-${suffix}`;

    await seedHouseholdWithOwner(createTestDb(getIntegrationEnv().DB), {
      householdId,
      ownerId,
      ownerAuthId: `clerk_tags_${suffix}`,
    });
  });

  function call(method: string, path = "", body?: unknown) {
    return handleTagsRequest({
      env: getIntegrationEnv(),
      params: path ? { "*": path } : {},
      request: new Request(`http://localhost/api/tags${path ? `/${path}` : ""}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      }),
      session: testSession({ userId: ownerId, householdId }),
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
  }

  it("creates, recolors, and deletes a tag with the added colors", async () => {
    const created = await call("POST", "", { name: "Bulk barn", color: "teal" });
    expect(created.status).toBe(201);
    const tag = (await created.json()) as { id: string; color: string };
    expect(tag.color).toBe("teal");

    const updated = await call("PATCH", tag.id, { name: "Bulk Barn", color: "ink" });
    expect(await updated.json()).toMatchObject({ name: "Bulk Barn", color: "ink" });

    const deleted = await call("DELETE", tag.id);
    expect(deleted.status).toBe(200);
    const db = createTestDb(getIntegrationEnv().DB);
    expect(
      await db.query.groceryTags.findFirst({ where: eq(groceryTags.id, tag.id) })
    ).toBeUndefined();
  });

  it("rejects a color outside the palette", async () => {
    await expect(call("POST", "", { name: "Costco", color: "chartreuse" })).rejects.toThrow();
  });
});
