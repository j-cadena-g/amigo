import { RouterContextProvider } from "react-router";
import type { PlatformProxy } from "wrangler";
import type { Context } from "hono";
import type { HonoEnv } from "./server/env";

export type Cloudflare = Omit<PlatformProxy, "dispose">;

export type HonoContextValue = {
  context: Context<HonoEnv>;
};

declare module "react-router" {
  interface RouterContextProvider {
    cloudflare: Cloudflare;
    hono: HonoContextValue;
  }
}

export function createRouterLoadContext(context: {
  cloudflare: Cloudflare;
  hono: HonoContextValue;
}): RouterContextProvider {
  const provider = new RouterContextProvider();
  return Object.assign(provider, context);
}
