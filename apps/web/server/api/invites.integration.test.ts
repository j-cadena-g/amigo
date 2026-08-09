import {
  eq,
  getDb,
  householdInvites,
  users,
} from "@amigo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleInviteAcceptRequest,
  handleInvitesRequest,
} from "./invites";
import { createTestDb, seedHouseholdWithOwner, testSession } from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";
import type { Env } from "../env";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUserMetadata: vi.fn(),
  createClerkClient: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: mocks.createClerkClient,
}));

function testEnv(overrides: Partial<Env> = {}): Env {
  const base = getIntegrationEnv();
  return {
    ...base,
    APP_ORIGIN: "https://app.example.test",
    EMAIL: { send: mocks.sendEmail },
    ...overrides,
  };
}

function clerkAuth(userId: string) {
  return { userId } as never;
}

describe("invites integration", () => {
  let householdId: string;
  let ownerId: string;
  let suffix: string;

  beforeEach(async () => {
    suffix = crypto.randomUUID();
    householdId = `hh-invites-${suffix}`;
    ownerId = `user-invites-owner-${suffix}`;

    mocks.getUser.mockReset();
    mocks.updateUserMetadata.mockReset();
    mocks.sendEmail.mockReset();
    mocks.getUser.mockResolvedValue({
      emailAddresses: [{ id: "email-1", emailAddress: "joiner@example.com" }],
      primaryEmailAddressId: "email-1",
      firstName: "Join",
      lastName: "Er",
      publicMetadata: {},
    });
    mocks.updateUserMetadata.mockResolvedValue({});
    mocks.sendEmail.mockResolvedValue({ messageId: "msg_invite_1" });
    mocks.createClerkClient.mockReset();
    mocks.createClerkClient.mockReturnValue({
      users: {
        getUser: mocks.getUser,
        updateUserMetadata: mocks.updateUserMetadata,
      },
    });

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_invites_owner_${suffix}`,
      householdName: "Invite Household",
    });
  });

  async function createInvite(email?: string) {
    const response = await handleInvitesRequest({
      env: testEnv(),
      params: {},
      request: new Request("http://localhost/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(email ? { email } : {}),
      }),
      sessionStatus: "authenticated",
      session: testSession({
        userId: ownerId,
        householdId,
        role: "owner",
      }),
      loadContext: {} as never,
    });
    const body = (await response.json()) as {
      id: string;
      code: string;
      joinUrl: string;
      emailSent: boolean;
      emailError?: string;
    };
    return { response, body };
  }

  it("creates an invite and accepts it as a member", async () => {
    const { response, body } = await createInvite();
    expect(response.status).toBe(201);
    expect(body.code).toMatch(/^AMIGO-[A-Z2-9]{6}$/);
    expect(body.joinUrl).toBe(
      `https://app.example.test/join/${encodeURIComponent(body.code)}`
    );
    expect(body.emailSent).toBe(false);

    const joinerAuthId = `clerk_invites_joiner_${suffix}`;
    const acceptResponse = await handleInviteAcceptRequest({
      env: testEnv(),
      params: {},
      request: new Request("http://localhost/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: body.code.toLowerCase() }),
      }),
      sessionStatus: "needs_setup",
      loadContext: {} as never,
      auth: clerkAuth(joinerAuthId),
    });

    expect(acceptResponse.status).toBe(201);
    const acceptBody = (await acceptResponse.json()) as {
      success: boolean;
      householdId: string;
    };
    expect(acceptBody.success).toBe(true);
    expect(acceptBody.householdId).toBe(householdId);

    const db = getDb(getIntegrationEnv().DB);
    const member = await db
      .select()
      .from(users)
      .where(eq(users.authId, joinerAuthId))
      .get();
    expect(member?.role).toBe("member");
    expect(member?.householdId).toBe(householdId);

    const invite = await db
      .select()
      .from(householdInvites)
      .where(eq(householdInvites.id, body.id))
      .get();
    expect(invite?.usedAt).toBeInstanceOf(Date);
    expect(invite?.usedByUserId).toBe(member?.id);

    expect(mocks.updateUserMetadata).toHaveBeenCalledWith(joinerAuthId, {
      publicMetadata: {
        householdId,
        householdName: "Invite Household",
      },
    });
  });

  it("lists pending invites with server-canonical joinUrl", async () => {
    const { body } = await createInvite();

    const listResponse = await handleInvitesRequest({
      env: testEnv(),
      params: {},
      request: new Request("http://localhost/api/invites", {
        method: "GET",
      }),
      sessionStatus: "authenticated",
      session: testSession({
        userId: ownerId,
        householdId,
        role: "owner",
      }),
      loadContext: {} as never,
    });

    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as Array<{
      id: string;
      codeDisplay: string;
      joinUrl: string;
    }>;
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(body.id);
    expect(listed[0]?.codeDisplay).toBe(body.code);
    expect(listed[0]?.joinUrl).toBe(
      `https://app.example.test/join/${encodeURIComponent(body.code)}`
    );
    expect(listed[0]?.joinUrl).toBe(body.joinUrl);
  });

  it("rejects a second accept of the same code", async () => {
    const { body } = await createInvite();
    const firstAuthId = `clerk_invites_first_${suffix}`;
    const secondAuthId = `clerk_invites_second_${suffix}`;

    const first = await handleInviteAcceptRequest({
      env: testEnv(),
      params: {},
      request: new Request("http://localhost/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: body.code }),
      }),
      sessionStatus: "needs_setup",
      loadContext: {} as never,
      auth: clerkAuth(firstAuthId),
    });
    expect(first.status).toBe(201);

    await expect(
      handleInviteAcceptRequest({
        env: testEnv(),
        params: {},
        request: new Request("http://localhost/api/invites/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: body.code }),
        }),
        sessionStatus: "needs_setup",
        loadContext: {} as never,
        auth: clerkAuth(secondAuthId),
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Invalid or expired invite code",
    });
  });

  it("rejects accept after revoke", async () => {
    const { body } = await createInvite();

    const revokeResponse = await handleInvitesRequest({
      env: testEnv(),
      params: { "*": body.id },
      request: new Request(`http://localhost/api/invites/${body.id}`, {
        method: "DELETE",
      }),
      sessionStatus: "authenticated",
      session: testSession({
        userId: ownerId,
        householdId,
        role: "owner",
      }),
      loadContext: {} as never,
    });
    expect(revokeResponse.status).toBe(200);

    await expect(
      handleInviteAcceptRequest({
        env: testEnv(),
        params: {},
        request: new Request("http://localhost/api/invites/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: body.code }),
        }),
        sessionStatus: "needs_setup",
        loadContext: {} as never,
        auth: clerkAuth(`clerk_invites_revoked_${suffix}`),
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Invalid or expired invite code",
    });
  });

  it("sends email on create and keeps invite when send fails", async () => {
    const { response, body } = await createInvite("friend@example.com");
    expect(response.status).toBe(201);
    expect(body.emailSent).toBe(true);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "friend@example.com",
        from: { email: "invites@mail.mi-amigo.com", name: "Amigo" },
      })
    );

    mocks.sendEmail.mockRejectedValueOnce(new Error("SMTP down"));
    const failed = await createInvite("other@example.com");
    expect(failed.response.status).toBe(201);
    expect(failed.body.emailSent).toBe(false);
    expect(failed.body.emailError).toMatch(/SMTP down/);

    const db = getDb(getIntegrationEnv().DB);
    const invite = await db
      .select()
      .from(householdInvites)
      .where(eq(householdInvites.id, failed.body.id))
      .get();
    expect(invite).toBeDefined();
    expect(invite?.invitedEmail).toBe("other@example.com");
    expect(invite?.emailSentAt).toBeNull();
    expect(invite?.emailLastError).toMatch(/SMTP down/);
  });
});
