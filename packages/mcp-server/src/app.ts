import { Hono } from "hono";
import { logInfo } from "./lib/log";

export function createApp(): Hono {
  const app = new Hono();

  app.use(async (c, next) => {
    const start = Date.now();
    await next();
    logInfo("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - start,
    });
  });

  // Mounted before anything that needs env or secrets so a misconfigured deploy still passes healthchecks.
  app.get("/health", (c) =>
    c.json({ status: "ok", timestamp: new Date().toISOString() }),
  );

  return app;
}
