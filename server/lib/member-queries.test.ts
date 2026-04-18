import { describe, expect, it, vi } from "vitest";

vi.mock("@amigo/db", () => ({
  users: {
    id: { name: "id" },
    householdId: { name: "household_id" },
    deletedAt: { name: "deleted_at" },
  },
  eq: (...args: unknown[]) => ({ type: "eq", args }),
  and: (...args: unknown[]) => ({ type: "and", args }),
  isNull: (arg: unknown) => ({ type: "isNull", arg }),
  scopeToHousehold: (...args: unknown[]) => ({ type: "scopeToHousehold", args }),
}));

import { getTransferOwnershipUsers } from "./member-queries";

describe("getTransferOwnershipUsers", () => {
  it("prefetches both transfer participants before the ownership batch", async () => {
    const newOwner = { id: "user-2", authId: "auth-2" };
    const currentUser = { id: "user-1", authId: "auth-1" };
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(newOwner)
      .mockResolvedValueOnce(currentUser);
    const db = {
      query: {
        users: {
          findFirst,
        },
      },
    };

    await expect(
      getTransferOwnershipUsers(db as never, "house-1", "user-1", "user-2")
    ).resolves.toEqual([newOwner, currentUser]);

    expect(findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        type: "and",
        args: [
          { type: "eq", args: [{ name: "id" }, "user-2"] },
          { type: "scopeToHousehold", args: [{ name: "household_id" }, "house-1"] },
          { type: "isNull", arg: { name: "deleted_at" } },
        ],
      },
    });
    expect(findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        type: "and",
        args: [
          { type: "eq", args: [{ name: "id" }, "user-1"] },
          { type: "scopeToHousehold", args: [{ name: "household_id" }, "house-1"] },
          { type: "isNull", arg: { name: "deleted_at" } },
        ],
      },
    });
  });

  it("returns undefined for a missing new owner without skipping the current user lookup", async () => {
    const currentUser = { id: "user-1", authId: "auth-1" };
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(currentUser);
    const db = {
      query: {
        users: {
          findFirst,
        },
      },
    };

    await expect(
      getTransferOwnershipUsers(db as never, "house-1", "user-1", "user-2")
    ).resolves.toEqual([undefined, currentUser]);

    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("returns undefined for a missing current user after prefetching the new owner", async () => {
    const newOwner = { id: "user-2", authId: "auth-2" };
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(newOwner)
      .mockResolvedValueOnce(undefined);
    const db = {
      query: {
        users: {
          findFirst,
        },
      },
    };

    await expect(
      getTransferOwnershipUsers(db as never, "house-1", "user-1", "user-2")
    ).resolves.toEqual([newOwner, undefined]);

    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("returns undefined for both users when neither lookup finds an active household member", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const db = {
      query: {
        users: {
          findFirst,
        },
      },
    };

    await expect(
      getTransferOwnershipUsers(db as never, "house-1", "user-1", "user-2")
    ).resolves.toEqual([undefined, undefined]);

    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});
