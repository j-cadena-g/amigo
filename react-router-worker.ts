import { Hono } from "hono";
import { createRequestHandler } from "react-router";
import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "./server/env";
import type { Cloudflare } from "./router-context";

type LoadContextArgs = {
  request: Request;
  context: {
    cloudflare: Cloudflare;
    hono: { context: import("hono").Context<HonoEnv> };
  };
};

type GetLoadContext = (args: LoadContextArgs) => unknown | Promise<unknown>;

function createLoadContextArgs(c: import("hono").Context<HonoEnv>): LoadContextArgs {
  return {
    context: {
      cloudflare: {
        env: c.env,
        cf: c.req.raw.cf,
        ctx: c.executionCtx,
        caches: globalThis.caches,
      } as unknown as Cloudflare,
      hono: {
        context: c,
      },
    },
    request: c.req.raw,
  };
}

function createReactRouterMiddleware(build: unknown, getLoadContext?: GetLoadContext): MiddlewareHandler<HonoEnv> {
  return async (c) => {
    const requestHandler = createRequestHandler(
      build as Parameters<typeof createRequestHandler>[0],
      "production"
    );
    const args = createLoadContextArgs(c);
    const loadContext = getLoadContext ? await getLoadContext(args) : args.context;
    return requestHandler(
      c.req.raw,
      loadContext as Parameters<typeof requestHandler>[1]
    );
  };
}

export default function handleReactRouterWorker(
  build: unknown,
  userApp?: Hono<HonoEnv>,
  options?: { getLoadContext?: GetLoadContext }
) {
  const app = new Hono<HonoEnv>();

  if (userApp) {
    app.route("/", userApp);
  }

  app.use(createReactRouterMiddleware(build, options?.getLoadContext));
  return app;
}
