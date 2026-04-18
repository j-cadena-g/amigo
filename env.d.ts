import "react-router";
import type { Context } from "hono";
import type { HonoEnv } from "./server/env";
import type { Cloudflare } from "./router-context";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: Cloudflare;
    hono: {
      context: Context<HonoEnv>;
    };
  }
}
