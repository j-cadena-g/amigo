import { createContext, RouterContextProvider } from "react-router";
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

export const cloudflareContext = createContext<Cloudflare>();
export const appContext = createContext<AppContextValue>();

export type RouterContext = Pick<RouterContextProvider, "get">;

export function createRouterLoadContext(values: {
  cloudflare: Cloudflare;
  app: AppContextValue;
}): RouterContextProvider {
  const provider = new RouterContextProvider();
  provider.set(cloudflareContext, values.cloudflare);
  provider.set(appContext, values.app);
  return provider;
}

export function getCloudflare(context: RouterContext): Cloudflare {
  return context.get(cloudflareContext);
}

export function getApp(context: RouterContext): AppContextValue {
  return context.get(appContext);
}
