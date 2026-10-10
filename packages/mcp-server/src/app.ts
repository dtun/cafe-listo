import { Hono } from "hono";
import { logError, logInfo } from "./lib/log";
import { createMcpRoutes, type McpRouteDeps } from "./routes/mcp";
import { createOAuthRoutes } from "./routes/oauth";
import { createWellKnownRoutes } from "./routes/well-known";

export interface AppDeps {
  /** Omitted when auth/storage config is missing: /mcp stays unmounted, /health still works. */
  mcp?: McpRouteDeps;
}

export function createApp(deps: AppDeps = {}): Hono {
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

  app.onError((error, c) => {
    logError("unhandled_error", {
      method: c.req.method,
      path: c.req.path,
      error: error.message,
    });
    return c.json({ error: "internal_error" }, 500);
  });

  // Liveness: needs no env or secrets, so it answers even when config is incomplete.
  app.get("/health", (c) =>
    c.json({ status: "ok", timestamp: new Date().toISOString() }),
  );

  // Readiness: the deploy healthcheck. Fails until /mcp and the OAuth routes are mounted,
  // so a deploy with incomplete config never replaces a working one.
  const ready = Boolean(deps.mcp?.oauth);
  app.get("/ready", (c) =>
    ready
      ? c.json({ status: "ready" })
      : c.json({ status: "not_ready", reason: "config_incomplete" }, 503),
  );

  if (deps.mcp) {
    app.route(
      "/.well-known",
      createWellKnownRoutes({ publicBaseUrl: deps.mcp.publicBaseUrl }),
    );
    if (deps.mcp.oauth) app.route("/", createOAuthRoutes(deps.mcp.oauth));
    app.route("/mcp", createMcpRoutes(deps.mcp));
  }

  return app;
}
