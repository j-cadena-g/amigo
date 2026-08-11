import { createClerkClient } from "@clerk/backend";
import {
  and,
  eq,
  getDb,
  gt,
  householdInvites,
  households,
  isNull,
  scopeToHousehold,
  users,
} from "@amigo/db";
import { z } from "zod";
import { setClerkHouseholdMetadata } from "../lib/clerk-household-metadata";
import { sendTransactionalEmail } from "../lib/email";
import { ActionError, logServerError } from "../lib/errors";
import { buildInviteEmailContent } from "../lib/invite-email";
import {
  generateInviteCode,
  hashInviteCode,
  normalizeInviteCode,
} from "../lib/invite-code";
import { assertPermission, canManageMembers } from "../lib/permissions";
import { assertSessionStillValid } from "../lib/session";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { getSplatPath, getSplatSegments, type ApiHandler } from "./route";
import { insertManyAuditLogs, withAudit } from "../lib/audit";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Stable client-facing message — never echo provider Error.message. */
const INVITE_EMAIL_FAILURE_MESSAGE = "Failed to send invite email";

const createInviteSchema = z.object({
  email: z.email().optional(),
});

const acceptInviteSchema = z.object({
  code: z.string().min(1).max(64),
});

function isAuthIdUniqueConstraintError(error: unknown) {
  return (
    error instanceof Error &&
    /(?:UNIQUE constraint failed: users\.auth_id|UNIQUE constraint failed: users\.authId)/i.test(
      error.message
    )
  );
}

function buildJoinUrl(appOrigin: string, codeDisplay: string): string {
  return `${appOrigin}/join/${encodeURIComponent(codeDisplay)}`;
}

function pendingInviteFilter(householdId: string, now: Date) {
  return and(
    scopeToHousehold(householdInvites.householdId, householdId),
    isNull(householdInvites.usedAt),
    isNull(householdInvites.revokedAt),
    gt(householdInvites.expiresAt, now)
  );
}

function validInviteByHashFilter(codeHash: string, now: Date) {
  return and(
    eq(householdInvites.codeHash, codeHash),
    isNull(householdInvites.usedAt),
    isNull(householdInvites.revokedAt),
    gt(householdInvites.expiresAt, now)
  );
}

async function sendInviteEmail(options: {
  env: Parameters<ApiHandler>[0]["env"];
  to: string;
  householdName: string;
  inviterName: string;
  codeDisplay: string;
  expiresAt: Date;
}): Promise<{ sent: boolean; error: string | null }> {
  const joinUrl = buildJoinUrl(options.env.APP_ORIGIN, options.codeDisplay);
  const content = buildInviteEmailContent({
    householdName: options.householdName,
    inviterName: options.inviterName,
    code: options.codeDisplay,
    joinUrl,
    expiresAt: options.expiresAt,
  });

  try {
    await sendTransactionalEmail(options.env.EMAIL, {
      to: options.to,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    return { sent: true, error: null };
  } catch (error) {
    // Log operational detail without recipient PII; never return provider text.
    logServerError("invite-email-send", error, {
      code: "invite_email_delivery_failed",
    });
    return { sent: false, error: INVITE_EMAIL_FAILURE_MESSAGE };
  }
}

export const handleInvitesRequest: ApiHandler = async ({
  env,
  params,
  request,
  session,
}) => {
  const path = getSplatPath(params);
  const splatSegments = getSplatSegments(params);
  const [inviteId, action] = splatSegments;
  const db = getDb(env.DB);
  const now = new Date();

  if (request.method === "GET" && !path) {
    await enforceRateLimit(
      env,
      `${session!.userId}:invites:list`,
      ROUTE_RATE_LIMITS.invites.list
    );
    assertPermission(
      canManageMembers(session!),
      "Not authorized to manage invites"
    );

    const invites = await db
      .select({
        id: householdInvites.id,
        codeDisplay: householdInvites.codeDisplay,
        invitedEmail: householdInvites.invitedEmail,
        emailSentAt: householdInvites.emailSentAt,
        emailLastError: householdInvites.emailLastError,
        expiresAt: householdInvites.expiresAt,
        createdAt: householdInvites.createdAt,
      })
      .from(householdInvites)
      .where(pendingInviteFilter(session!.householdId, now));

    return Response.json(
      invites.map((invite) => ({
        ...invite,
        joinUrl: buildJoinUrl(env.APP_ORIGIN, invite.codeDisplay),
      }))
    );
  }

  if (request.method === "POST" && !path) {
    await enforceRateLimit(
      env,
      `${session!.userId}:invites:create`,
      ROUTE_RATE_LIMITS.invites.create
    );
    assertPermission(
      canManageMembers(session!),
      "Not authorized to manage invites"
    );
    await assertSessionStillValid(db, session!);

    const body = createInviteSchema.parse(await request.json().catch(() => ({})));
    const invitedEmail = body.email?.trim().toLowerCase() || null;
    const { code, codeDisplay, codeHash } = await generateInviteCode();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const inviteIdValue = crypto.randomUUID();

    const household = await db
      .select({ name: households.name })
      .from(households)
      .where(eq(households.id, session!.householdId))
      .get();

    if (!household) {
      throw new ActionError("Household not found", "NOT_FOUND");
    }

    await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "household_invites",
        recordId: inviteIdValue,
        operation: "INSERT",
        newValues: {
          id: inviteIdValue,
          expiresAt: expiresAt.toISOString(),
          createdByUserId: session!.userId,
          hasInvitedEmail: Boolean(invitedEmail),
        },
        changedBy: session!.userId,
      },
      async () => {
        await db.insert(householdInvites).values({
          id: inviteIdValue,
          householdId: session!.householdId,
          codeHash,
          codeDisplay,
          createdByUserId: session!.userId,
          invitedEmail,
          expiresAt,
        });
        return { id: inviteIdValue };
      }
    );

    let emailSent = false;
    let emailError: string | null = null;

    if (invitedEmail) {
      const inviterName = session!.name?.trim() || session!.email;
      const sendResult = await sendInviteEmail({
        env,
        to: invitedEmail,
        householdName: household.name,
        inviterName,
        codeDisplay,
        expiresAt,
      });
      emailSent = sendResult.sent;
      emailError = sendResult.error;

      await db
        .update(householdInvites)
        .set({
          emailSentAt: emailSent ? new Date() : null,
          emailLastError: emailError,
        })
        .where(eq(householdInvites.id, inviteIdValue));
    }

    return Response.json(
      {
        id: inviteIdValue,
        code,
        joinUrl: buildJoinUrl(env.APP_ORIGIN, codeDisplay),
        expiresAt: expiresAt.toISOString(),
        invitedEmail,
        emailSent,
        ...(emailError ? { emailError } : {}),
      },
      { status: 201 }
    );
  }

  if (
    request.method === "DELETE" &&
    inviteId &&
    !action &&
    splatSegments.length === 1
  ) {
    await enforceRateLimit(
      env,
      `${session!.userId}:invites:revoke`,
      ROUTE_RATE_LIMITS.invites.revoke
    );
    assertPermission(
      canManageMembers(session!),
      "Not authorized to manage invites"
    );
    await assertSessionStillValid(db, session!);

    const invite = await db
      .select({
        id: householdInvites.id,
        usedAt: householdInvites.usedAt,
        revokedAt: householdInvites.revokedAt,
      })
      .from(householdInvites)
      .where(
        and(
          eq(householdInvites.id, inviteId),
          scopeToHousehold(householdInvites.householdId, session!.householdId)
        )
      )
      .get();

    if (!invite) {
      throw new ActionError("Invite not found", "NOT_FOUND");
    }

    if (invite.usedAt) {
      throw new ActionError("Invite already used", "VALIDATION_ERROR");
    }

    if (invite.revokedAt) {
      throw new ActionError("Invite already revoked", "VALIDATION_ERROR");
    }

    await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "household_invites",
        recordId: inviteId,
        operation: "UPDATE",
        oldValues: { revokedAt: null },
        newValues: (result) => ({ revokedAt: result.revokedAt }),
        changedBy: session!.userId,
      },
      async () => {
        const result = await db
          .update(householdInvites)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(householdInvites.id, inviteId),
              scopeToHousehold(
                householdInvites.householdId,
                session!.householdId
              ),
              isNull(householdInvites.usedAt),
              isNull(householdInvites.revokedAt)
            )
          )
          .returning({
            id: householdInvites.id,
            revokedAt: householdInvites.revokedAt,
          })
          .get();

        if (!result) {
          throw new ActionError("Invite is no longer valid", "VALIDATION_ERROR");
        }
        return result;
      }
    );

    return Response.json({ success: true });
  }

  if (
    request.method === "POST" &&
    inviteId &&
    action === "resend" &&
    splatSegments.length === 2
  ) {
    await enforceRateLimit(
      env,
      `${session!.userId}:invites:resend`,
      ROUTE_RATE_LIMITS.invites.resend
    );
    assertPermission(
      canManageMembers(session!),
      "Not authorized to manage invites"
    );
    await assertSessionStillValid(db, session!);

    const invite = await db
      .select({
        id: householdInvites.id,
        codeDisplay: householdInvites.codeDisplay,
        invitedEmail: householdInvites.invitedEmail,
        expiresAt: householdInvites.expiresAt,
        usedAt: householdInvites.usedAt,
        revokedAt: householdInvites.revokedAt,
      })
      .from(householdInvites)
      .where(
        and(
          eq(householdInvites.id, inviteId),
          scopeToHousehold(householdInvites.householdId, session!.householdId)
        )
      )
      .get();

    if (!invite) {
      throw new ActionError("Invite not found", "NOT_FOUND");
    }

    if (invite.usedAt || invite.revokedAt || invite.expiresAt <= now) {
      throw new ActionError("Invite is no longer valid", "VALIDATION_ERROR");
    }

    if (!invite.invitedEmail) {
      throw new ActionError(
        "Invite has no email address to resend",
        "VALIDATION_ERROR"
      );
    }

    const household = await db
      .select({ name: households.name })
      .from(households)
      .where(eq(households.id, session!.householdId))
      .get();

    if (!household) {
      throw new ActionError("Household not found", "NOT_FOUND");
    }

    const inviterName = session!.name?.trim() || session!.email;
    const sendResult = await sendInviteEmail({
      env,
      to: invite.invitedEmail,
      householdName: household.name,
      inviterName,
      codeDisplay: invite.codeDisplay,
      expiresAt: invite.expiresAt,
    });

    await db
      .update(householdInvites)
      .set(
        sendResult.sent
          ? { emailSentAt: new Date(), emailLastError: null }
          : { emailLastError: sendResult.error }
      )
      .where(
        and(
          eq(householdInvites.id, inviteId),
          scopeToHousehold(householdInvites.householdId, session!.householdId)
        )
      );

    return Response.json({
      success: sendResult.sent,
      emailSent: sendResult.sent,
      ...(sendResult.error ? { emailError: sendResult.error } : {}),
    });
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, DELETE" },
  });
};

export const handleInviteAcceptRequest: ApiHandler = async ({
  auth,
  env,
  request,
}) => {
  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  if (!auth?.userId) {
    throw new ActionError("Unauthorized", "UNAUTHORIZED");
  }

  await enforceRateLimit(
    env,
    `${auth.userId}:invites:accept`,
    ROUTE_RATE_LIMITS.invites.accept
  );

  const { code } = acceptInviteSchema.parse(
    await request.json().catch(() => ({}))
  );
  const normalized = normalizeInviteCode(code);
  if (!normalized) {
    throw new ActionError("Invalid or expired invite code", "VALIDATION_ERROR");
  }

  const codeHash = await hashInviteCode(normalized);
  const db = getDb(env.DB);
  const now = new Date();

  const existingUser = await db
    .select({ id: users.id, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.authId, auth.userId))
    .get();

  if (existingUser && !existingUser.deletedAt) {
    throw new ActionError(
      "You already belong to a household",
      "PERMISSION_DENIED"
    );
  }

  if (existingUser?.deletedAt) {
    throw new ActionError(
      "Restore or permanently leave your previous household before joining another",
      "PERMISSION_DENIED"
    );
  }

  const invite = await db
    .select({
      id: householdInvites.id,
      householdId: householdInvites.householdId,
      householdName: households.name,
    })
    .from(householdInvites)
    .innerJoin(households, eq(householdInvites.householdId, households.id))
    .where(validInviteByHashFilter(codeHash, now))
    .get();

  if (!invite) {
    throw new ActionError("Invalid or expired invite code", "VALIDATION_ERROR");
  }

  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  const clerkUser = await clerk.users.getUser(auth.userId);
  const email = clerkUser.emailAddresses.find(
    (emailAddress) => emailAddress.id === clerkUser.primaryEmailAddressId
  )?.emailAddress;
  if (!email) {
    throw new ActionError(
      "A primary email address is required to join a household",
      "VALIDATION_ERROR"
    );
  }
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;
  const userId = crypto.randomUUID();
  const usedAt = new Date();

  // Claim with usedAt only first (usedByUserId FKs to users). A crash after
  // claim leaves a burned code, not an unused code after a membership row.
  const claimed = await db
    .update(householdInvites)
    .set({ usedAt })
    .where(
      and(
        eq(householdInvites.id, invite.id),
        isNull(householdInvites.usedAt),
        isNull(householdInvites.revokedAt),
        gt(householdInvites.expiresAt, usedAt)
      )
    )
    .returning({ id: householdInvites.id })
    .get();

  if (!claimed) {
    throw new ActionError("Invalid or expired invite code", "VALIDATION_ERROR");
  }

  try {
    await db.insert(users).values({
      id: userId,
      authId: auth.userId,
      email,
      name,
      householdId: invite.householdId,
      role: "member",
    });
  } catch (error) {
    await db
      .update(householdInvites)
      .set({ usedAt: null, usedByUserId: null })
      .where(
        and(
          eq(householdInvites.id, invite.id),
          isNull(householdInvites.usedByUserId)
        )
      );

    if (isAuthIdUniqueConstraintError(error)) {
      const conflicting = await db
        .select({ deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.authId, auth.userId))
        .get();

      if (conflicting?.deletedAt) {
        throw new ActionError(
          "Restore or permanently leave your previous household before joining another",
          "PERMISSION_DENIED"
        );
      }

      throw new ActionError(
        "You already belong to a household",
        "PERMISSION_DENIED"
      );
    }

    throw error;
  }

  await db
    .update(householdInvites)
    .set({ usedByUserId: userId })
    .where(
      and(
        eq(householdInvites.id, invite.id),
        isNull(householdInvites.usedByUserId)
      )
    );

  await insertManyAuditLogs(db, [
    {
      householdId: invite.householdId,
      tableName: "household_invites",
      recordId: invite.id,
      operation: "UPDATE",
      oldValues: { usedAt: null, usedByUserId: null },
      newValues: { usedAt: usedAt.toISOString(), usedByUserId: userId },
      changedBy: userId,
    },
    {
      householdId: invite.householdId,
      tableName: "users",
      recordId: userId,
      operation: "INSERT",
      newValues: {
        id: userId,
        role: "member",
        householdId: invite.householdId,
      },
      changedBy: userId,
    },
  ]);

  // Best-effort after D1 (matches settings rename). Session can repair later.
  try {
    await setClerkHouseholdMetadata(clerk, auth.userId, {
      householdId: invite.householdId,
      householdName: invite.householdName,
    });
  } catch (error) {
    logServerError("invite-accept-clerk-metadata", error, {
      authUserId: auth.userId,
      householdId: invite.householdId,
      userId,
    });
  }

  return Response.json(
    { success: true, householdId: invite.householdId },
    { status: 201 }
  );
};
