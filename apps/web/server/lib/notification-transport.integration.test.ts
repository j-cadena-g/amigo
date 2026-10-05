import { createDecipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from "cloudflare:test";
import {
  eq,
  getDb,
  households,
  pushSubscriptions,
  recurringTransactions,
  recurringReminderDeliveries,
  users,
  transactionReminderDeliveries,
  transactions,
} from "@amigo/db";
import { expect, it } from "vitest";
import webpush from "web-push";
import worker from "../../worker";
import { seedHouseholdWithOwner } from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

interface CapturedPush {
  path: string;
  headers: Record<string, string>;
  body: number[];
}

it("runs a scheduled reminder through real encrypted Web Push transport exactly once locally", async () => {
  // Every key is generated for this test. No browser or developer credentials are involved.
  const vapid = webpush.generateVAPIDKeys();
  const recipient = createECDH("prime256v1");
  const publicKey = recipient.generateKeys();
  const authSecret = Buffer.from(randomBytes(16));
  const env = {
    ...getIntegrationEnv(),
    VAPID_SUBJECT: "mailto:notification-test@example.test",
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
  };
  const db = getDb(env.DB);
  const householdId = `hh-push-transport-${crypto.randomUUID()}`;
  const ownerId = `user-push-transport-${crypto.randomUUID()}`;
  const subscriptionId = crypto.randomUUID();
  const transactionId = crypto.randomUUID();
  const recurringId = crypto.randomUUID();
  const reminderAt = new Date();
  reminderAt.setUTCSeconds(0, 0);
  const description = "Local transport phone bill";

  await seedHouseholdWithOwner(db, { householdId, ownerId, ownerAuthId: crypto.randomUUID() });
  try {
    await db.insert(pushSubscriptions).values({
      id: subscriptionId,
      userId: ownerId,
      endpoint: `https://local-push.test/push/${subscriptionId}`,
      keys: {
        p256dh: Buffer.from(publicKey).toString("base64url"),
        auth: authSecret.toString("base64url"),
      },
    });
    await db.insert(transactions).values({
      id: transactionId,
      householdId,
      userId: ownerId,
      amount: 10000,
      currency: "CAD",
      category: "Utilities",
      description,
      type: "expense",
      date: reminderAt.toISOString().slice(0, 10),
      reminderUserId: ownerId,
      reminderTimes: [reminderAt.toISOString()],
    });
    await db.update(users).set({ recurringNotifications: true }).where(eq(users.id, ownerId));
    await db.insert(recurringTransactions).values({
      id: recurringId,
      householdId,
      userId: ownerId,
      amount: 200000,
      currency: "CAD",
      category: "Income",
      description: "Local transport salary",
      type: "income",
      frequency: "DAILY",
      interval: 1,
      startDate: reminderAt.toISOString().slice(0, 10),
      nextRunDate: reminderAt.toISOString().slice(0, 10),
      reminderSchedules: [{ dayOffset: 0, time: reminderAt.toISOString().slice(11, 16) }],
    });

    const runCron = async () => {
      const context = createExecutionContext();
      await worker.scheduled(
        createScheduledController({ cron: "* * * * *" }) as unknown as ScheduledEvent,
        env,
        context
      );
      await waitOnExecutionContext(context);
    };
    await runCron();
    const captureResponse = await fetch("https://local-push.test/_captures");
    expect(captureResponse.status).toBe(200);
    const captures = (await captureResponse.json()) as CapturedPush[];
    expect(captures).toHaveLength(2);
    const payloads: Array<{ title: string; body: string; data: { url: string; type: string } }> =
      [];
    for (const captured of captures) {
      expect(captured.path).toBe(`/push/${subscriptionId}`);
      expect(captured.headers["content-encoding"]).toBe("aes128gcm");
      expect(Number(captured.headers.ttl)).toBeGreaterThan(10_700);
      expect(Number(captured.headers.ttl)).toBeLessThanOrEqual(10_800);
      expect(captured.headers.authorization).toMatch(/^vapid t=.+, k=/);
      expect(captured.headers.authorization).toContain(vapid.publicKey);
      const encrypted = Buffer.from(captured.body);
      expect(encrypted.length).toBeGreaterThan(100);
      expect(encrypted.includes(Buffer.from(description))).toBe(false);
      expect(encrypted[20]).toBe(65); // RFC 8188 aes128gcm header includes a P-256 public key.

      // Independently decrypt the single RFC 8291 record using this fake recipient's key.
      const salt = encrypted.subarray(0, 16);
      const senderKey = encrypted.subarray(21, 86);
      const ikm = hkdfSync(
        "sha256",
        recipient.computeSecret(senderKey),
        authSecret,
        Buffer.concat([Buffer.from("WebPush: info\0"), Buffer.from(publicKey), senderKey]),
        32
      );
      const key = hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
      const nonce = hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12);
      const decipher = createDecipheriv("aes-128-gcm", Buffer.from(key), Buffer.from(nonce));
      decipher.setAuthTag(encrypted.subarray(-16));
      const plaintext = Buffer.concat([
        Buffer.from(decipher.update(encrypted.subarray(86, -16))),
        Buffer.from(decipher.final()),
      ]);
      expect(plaintext.at(-1)).toBe(2); // Final-record delimiter.
      payloads.push(JSON.parse(plaintext.subarray(0, -1).toString()));
    }
    expect(payloads.find((payload) => payload.data.type === "transaction-reminder")).toMatchObject({
      title: "Transaction reminder",
      body: `Reminder: ${description}`,
      data: { url: "/financial", type: "transaction-reminder" },
    });
    expect(payloads.find((payload) => payload.data.type === "recurring-reminder")).toMatchObject({
      title: "Recurring transaction reminder",
      body: "Reminder: Local transport salary",
      data: { url: "/financial/recurring", type: "recurring-reminder" },
    });

    const delivery = await db.query.transactionReminderDeliveries.findFirst({
      where: eq(transactionReminderDeliveries.transactionId, transactionId),
    });
    expect(delivery?.deliveredAt).toBeInstanceOf(Date);
    const recurringDelivery = await db.query.recurringReminderDeliveries.findFirst({
      where: eq(recurringReminderDeliveries.subscriptionId, subscriptionId),
    });
    expect(recurringDelivery?.deliveredAt).toBeInstanceOf(Date);
    expect(recurringDelivery?.reminderDate).toBe(reminderAt.toISOString().slice(0, 10));
    const subscription = await db.query.pushSubscriptions.findFirst({
      where: eq(pushSubscriptions.id, subscriptionId),
    });
    expect(subscription?.lastPushAt).toBeInstanceOf(Date);

    await runCron();
    const repeatedCaptures = await (await fetch("https://local-push.test/_captures")).json();
    expect(repeatedCaptures).toHaveLength(2);
  } finally {
    await db.delete(households).where(eq(households.id, householdId));
  }
});
