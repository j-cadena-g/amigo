import { RouterContextProvider } from "react-router";
import type { Context } from "hono";
import type { HonoEnv } from "./server/env";
import type { PlatformProxy } from "wrangler";

type Cloudflare = Omit<PlatformProxy, "dispose">;

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: Cloudflare;
    hono: {
      context: Context<HonoEnv>;
    };
  }
}

type GetLoadContext = (args: {
  request: Request;
  context: {
    cloudflare: Cloudflare;
    hono: { context: Context<HonoEnv> };
  };
}) => RouterContextProvider;

export const getLoadContext: GetLoadContext = ({ context }) => {
  const provider = new RouterContextProvider();
  provider.set("cloudflare" as never, context.cloudflare as never);
  provider.set("hono" as never, context.hono as never);
  return provider;
};
