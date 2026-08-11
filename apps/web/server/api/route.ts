import { getAuth } from "@clerk/react-router/server";
import { getDb } from "@amigo/db";
import { getApp, getCloudflare, type RouterLoadContext } from "../../router-context";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  Params,
} from "react-router";
import { ZodError } from "zod";
import type { AppSession, Env, SessionStatus } from "../env";
import { ActionError, jsonError } from "../lib/errors";
import { clerkTokenAuthOptions } from "../lib/clerk-auth-options";
import { isUnsafeHttpMethod, requestMatchesAllowedOrigin } from "../lib/request-origin";
import { assertSessionStillValid } from "../lib/session";

type ApiRouteArgs = LoaderFunctionArgs | ActionFunctionArgs;
type ApiAuthMode = "none" | "strict" | "clerk";

export type ClerkAuth = Awaited<ReturnType<typeof getAuth>>;

export type ApiHandlerArgs = {
  request: Request;
  params: Params<string>;
  env: Env;
  sessionStatus: SessionStatus;
  session?: AppSession;
  loadContext: RouterLoadContext;
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
    const requestIsUnsafe = isUnsafeHttpMethod(args.request.method);
    const baseArgs: ApiHandlerArgs = {
      request: args.request,
      params: args.params,
      env: getCloudflare(args.context).env,
      sessionStatus: getApp(args.context).sessionStatus,
      session: getApp(args.context).session,
      loadContext: args.context,
    };

    if (
      options.auth !== "none" &&
      requestIsUnsafe &&
      !requestMatchesAllowedOrigin(args.request, baseArgs.env.APP_ORIGIN)
    ) {
      return jsonError("Invalid request origin", "PERMISSION_DENIED");
    }

    if (options.auth === "strict") {
      const authError = getSessionErrorResponse(
        baseArgs.sessionStatus,
        baseArgs.session
      );
      if (authError) {
        return authError;
      }
      if (requestIsUnsafe) {
        await assertSessionStillValid(getDb(baseArgs.env.DB), baseArgs.session!);
      }
    }

    if (options.auth === "clerk") {
      const auth = await getAuth(
        args as Parameters<typeof getAuth>[0],
        clerkTokenAuthOptions(baseArgs.env.APP_ORIGIN)
      );
      const userId = "userId" in auth ? auth.userId : null;
      if (!userId) {
        return jsonError("Unauthorized", "UNAUTHORIZED");
      }
      baseArgs.auth = auth as NonNullable<ApiHandlerArgs["auth"]>;
    }

    return await options.handler(baseArgs);
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

  if (status === "needs_setup") {
    return jsonError("Household setup required", "PERMISSION_DENIED");
  }

  if (status === "revoked") {
    return jsonError("Account access revoked", "PERMISSION_DENIED");
  }

  return jsonError("Unauthorized", "UNAUTHORIZED");
}

function mapApiError(error: unknown) {
  if (error instanceof ActionError) {
    return jsonError(error.message, error.code);
  }

  if (error instanceof ZodError) {
    return jsonError("Validation error", "VALIDATION_ERROR", {
      details: error.issues,
    });
  }

  if (error instanceof SyntaxError) {
    return jsonError("Invalid JSON", "VALIDATION_ERROR");
  }

  console.error("Unhandled API error:", error);
  return jsonError("Internal server error", "INTERNAL_ERROR");
}
