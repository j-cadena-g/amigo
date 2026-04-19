import { getAuth } from "@clerk/react-router/server";
import type {
  ActionFunctionArgs,
  AppLoadContext,
  LoaderFunctionArgs,
  Params,
} from "react-router";
import { ZodError } from "zod";
import type { AppSession, Env, SessionStatus } from "../env";
import { ActionError } from "../lib/errors";

type ApiRouteArgs = LoaderFunctionArgs | ActionFunctionArgs;
type ApiAuthMode = "none" | "strict" | "clerk";

export type ClerkAuth = Awaited<ReturnType<typeof getAuth>>;

export type ApiHandlerArgs = {
  request: Request;
  params: Params<string>;
  env: Env;
  sessionStatus: SessionStatus;
  session?: AppSession;
  loadContext: AppLoadContext;
  auth?: ClerkAuth;
};

export type ApiHandler = (args: ApiHandlerArgs) => Promise<Response>;

export async function handleApiRoute(
  args: ApiRouteArgs,
  options: {
    auth: ApiAuthMode;
    handler: ApiHandler;
  }
) {
  try {
    const baseArgs: ApiHandlerArgs = {
      request: args.request,
      params: args.params,
      env: args.context.cloudflare.env,
      sessionStatus: args.context.app.sessionStatus,
      session: args.context.app.session,
      loadContext: args.context,
    };

    if (options.auth === "strict") {
      const authError = getSessionErrorResponse(
        baseArgs.sessionStatus,
        baseArgs.session
      );
      if (authError) {
        return authError;
      }
    }

    if (options.auth === "clerk") {
      const auth = await getAuth(args as Parameters<typeof getAuth>[0]);
      if (!auth.userId) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      baseArgs.auth = auth;
    }

    return options.handler(baseArgs);
  } catch (error) {
    return mapApiError(error);
  }
}

export function getSplatPath(params: Params<string>) {
  return params["*"] ?? "";
}

export function getSplatSegments(params: Params<string>) {
  const path = getSplatPath(params);
  return path ? path.split("/") : [];
}

function getSessionErrorResponse(
  status: SessionStatus,
  session?: AppSession
): Response | null {
  if (session) {
    return null;
  }

  if (status === "no_org") {
    return Response.json(
      { error: "Organization membership required" },
      { status: 403 }
    );
  }

  if (status === "needs_setup") {
    return Response.json(
      { error: "Household setup required" },
      { status: 403 }
    );
  }

  if (status === "revoked") {
    return Response.json(
      { error: "Account access revoked" },
      { status: 403 }
    );
  }

  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function mapApiError(error: unknown) {
  if (error instanceof ActionError) {
    const status = {
      UNAUTHORIZED: 401,
      VALIDATION_ERROR: 400,
      RATE_LIMITED: 429,
      PERMISSION_DENIED: 403,
      NOT_FOUND: 404,
    }[error.code] ?? 500;

    return Response.json(
      { error: error.message, code: error.code },
      { status }
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      { error: "Validation error", details: error.issues },
      { status: 400 }
    );
  }

  console.error("Unhandled API error:", error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
