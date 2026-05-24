import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono()
  .use("*", cors())
  .get("/api/health", (c) => {
    return c.json({ status: "ok" as const });
  });

export default app;
export type AppType = typeof app;
