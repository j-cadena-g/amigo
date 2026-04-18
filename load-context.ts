import type { RouterContextProvider } from "react-router";
import { createRouterLoadContext, type Cloudflare } from "./router-context";

type GetLoadContext = (args: {
  request: Request;
  context: {
    cloudflare: Cloudflare;
    hono: {
      context: import("hono").Context<import("./server/env").HonoEnv>;
    };
  };
}) => RouterContextProvider;

export const getLoadContext: GetLoadContext = ({ context }) =>
  createRouterLoadContext(context);
