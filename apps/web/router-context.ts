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

type AugmentedRouterContext = RouterContextProvider & {
  cloudflare: Cloudflare;
  app: AppContextValue;
};

export type RouterLoadContext = Pick<RouterContextProvider, "get">;

export function createRouterLoadContext(values: {
  cloudflare: Cloudflare;
  app: AppContextValue;
}): RouterContextProvider {
  const provider = new RouterContextProvider();
  // Attach values directly on the provider. Do not use createContext here:
  // worker.ts and the React Router server build are separate bundles, so
  // context tokens would not match at runtime.
  return Object.assign(provider, values);
}

export function getCloudflare(context: RouterLoadContext): Cloudflare {
  return (context as AugmentedRouterContext).cloudflare;
}

export function getApp(context: RouterLoadContext): AppContextValue {
  return (context as AugmentedRouterContext).app;
}
