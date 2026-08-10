import { and, assets, eq, financialAccounts, getDb, isNull } from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { handleAssetsRequest } from "./assets";
import {
  createTestDb,
  seedHouseholdWithOwner,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";
import { convertedAccountIdForAsset } from "../lib/legacy-asset-migration";

describe("assets convert integration", () => {
  let householdId: string;
  let ownerId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-asset-convert-${suffix}`;
    ownerId = `user-asset-convert-owner-${suffix}`;

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_asset_convert_owner_${suffix}`,
    });
  });

  it("converts a legacy asset to an account atomically and is retry-safe", async () => {
    const env = getIntegrationEnv();
    const db = getDb(env.DB);
    const session = testSession({ userId: ownerId, householdId });
    const assetId = `asset-${crypto.randomUUID()}`;

    await db.insert(assets).values({
      id: assetId,
      householdId,
      userId: ownerId,
      name: "Old checking",
      type: "BANK",
      balance: 1250,
      currency: "CAD",
    });

    const request = () =>
      handleAssetsRequest({
        env,
        params: { "*": `${assetId}/convert` },
        request: new Request(`http://localhost/api/assets/${assetId}/convert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountType: "SAVINGS" }),
        }),
        session,
        sessionStatus: "authenticated",
        loadContext: {} as never,
      });

    const first = await request();
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as {
      account: { id: string; type: string; balance: number; name: string };
      asset: { id: string; deletedAt: string | number | Date | null };
    };
    expect(firstBody.account.id).toBe(convertedAccountIdForAsset(assetId));
    expect(firstBody.account.type).toBe("SAVINGS");
    expect(firstBody.account.balance).toBe(1250);
    expect(firstBody.account.name).toBe("Old checking");
    expect(firstBody.asset.deletedAt).toBeTruthy();

    const second = await request();
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      account: { id: string };
    };
    expect(secondBody.account.id).toBe(convertedAccountIdForAsset(assetId));

    const liveAssets = await db.query.assets.findMany({
      where: and(
        eq(assets.householdId, householdId),
        isNull(assets.deletedAt)
      ),
    });
    expect(liveAssets).toHaveLength(0);

    const accounts = await db
      .select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(
        and(
          eq(financialAccounts.householdId, householdId),
          isNull(financialAccounts.deletedAt)
        )
      )
      .all();
    expect(accounts).toHaveLength(1);
  });

  it("rejects reconversion when the converted account was soft-deleted", async () => {
    const env = getIntegrationEnv();
    const db = getDb(env.DB);
    const session = testSession({ userId: ownerId, householdId });
    const assetId = `asset-soft-deleted-acct-${crypto.randomUUID()}`;
    const accountId = convertedAccountIdForAsset(assetId);

    await db.insert(assets).values({
      id: assetId,
      householdId,
      userId: ownerId,
      name: "Legacy cash",
      type: "CASH",
      balance: 400,
      currency: "CAD",
    });

    const first = await handleAssetsRequest({
      env,
      params: { "*": `${assetId}/convert` },
      request: new Request(`http://localhost/api/assets/${assetId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
    expect(first.status).toBe(201);

    await db
      .update(financialAccounts)
      .set({ deletedAt: new Date() })
      .where(eq(financialAccounts.id, accountId));

    // Simulate restoring the asset after a bad prior state (or manual DB repair).
    await db
      .update(assets)
      .set({ deletedAt: null })
      .where(eq(assets.id, assetId));

    await expect(
      handleAssetsRequest({
        env,
        params: { "*": `${assetId}/convert` },
        request: new Request(`http://localhost/api/assets/${assetId}/convert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
        session,
        sessionStatus: "authenticated",
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message:
        "A converted account for this asset already exists and was deleted. Restore it instead of converting again.",
    });

    const assetAfter = await db.query.assets.findFirst({
      where: eq(assets.id, assetId),
    });
    expect(assetAfter?.deletedAt).toBeNull();
  });

  it("rejects converting a normally deleted asset", async () => {
    const env = getIntegrationEnv();
    const db = getDb(env.DB);
    const session = testSession({ userId: ownerId, householdId });
    const assetId = `asset-deleted-${crypto.randomUUID()}`;

    await db.insert(assets).values({
      id: assetId,
      householdId,
      userId: ownerId,
      name: "Gone",
      type: "CASH",
      balance: 100,
      currency: "CAD",
      deletedAt: new Date(),
    });

    await expect(
      handleAssetsRequest({
        env,
        params: { "*": `${assetId}/convert` },
        request: new Request(`http://localhost/api/assets/${assetId}/convert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
        session,
        sessionStatus: "authenticated",
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Asset was deleted and cannot be converted",
    });
  });
});
