import "react-router";
import type { Context } from "hono";
import type { HonoEnv } from "./server/env";
import type { PlatformProxy } from "wrangler";

type Cloudflare = Omit<PlatformProxy, "dispose">;

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: Cloudflare;
    hono: {
      context: Context<HonoEnv>;
    };
  }
}
