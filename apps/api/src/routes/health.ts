import { Hono } from "hono";

export const healthRouter = new Hono().get("/", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});
