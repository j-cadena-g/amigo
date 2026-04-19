import { RouterContextProvider } from "react-router";
import type { Env } from "./server/env";
import type { AppSession, SessionStatus } from "./server/env";

export type Cloudflare = {
  env: Env;
  ctx: ExecutionContext;
  cf?: Request["cf"];
  caches: CacheStorage;
};

export type AppContextValue = {
  cspNonce: string;
  sessionStatus: SessionStatus;
  session?: AppSession;
};

declare module "react-router" {
  interface RouterContextProvider {
    cloudflare: Cloudflare;
    app: AppContextValue;
  }
}

export function createRouterLoadContext(context: {
  cloudflare: Cloudflare;
  app: AppContextValue;
}): RouterContextProvider {
  const provider = new RouterContextProvider();
  return Object.assign(provider, context);
}
