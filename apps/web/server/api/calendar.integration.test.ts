import { beforeEach, describe, expect, it } from "vitest";
import { groceryItems } from "@amigo/db";
import { handleCalendarRequest, type CalendarEvent } from "./calendar";
import { createTestDb, seedHouseholdWithOwner, testSession } from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

describe("calendar integration", () => {
  let householdId: string;
  let ownerId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-calendar-${suffix}`;
    ownerId = `user-calendar-${suffix}`;

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_calendar_${suffix}`,
      timezone: "America/Toronto",
    });
    // 22:00 on Sep 30 in Toronto is already Oct 1 in UTC.
    await db.insert(groceryItems).values({
      id: crypto.randomUUID(),
      householdId,
      createdByUserId: ownerId,
      itemName: "Milk",
      category: "Dairy & Eggs",
      isPurchased: true,
      purchasedAt: new Date("2026-10-01T02:00:00Z"),
    });
  });

  async function groceryDates(year: number, month: number) {
    const response = await handleCalendarRequest({
      env: getIntegrationEnv(),
      params: {},
      request: new Request(`http://localhost/api/calendar?year=${year}&month=${month}`),
      session: testSession({ userId: ownerId, householdId }),
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
    const { events } = (await response.json()) as { events: CalendarEvent[] };
    return events.filter((e) => e.type === "grocery_purchase").map((e) => e.date);
  }

  it("dates grocery purchases in the household timezone", async () => {
    expect(await groceryDates(2026, 9)).toEqual(["2026-09-30"]);
    expect(await groceryDates(2026, 10)).toEqual([]);
  });
});
