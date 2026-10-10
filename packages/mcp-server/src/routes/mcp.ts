import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import type { RequestAuth, TokenVerifier } from "../auth/types";
import type { UseCases } from "../container";
import { protectedResourceMetadataUrl, publicBaseUrl } from "../lib/base-url";
import { createMcpServer } from "../mcp/server";
import type { OAuthUseCases } from "../usecases/oauth";

export interface McpRouteDeps {
  verifier: TokenVerifier;
  /** Builds request-scoped use cases (adapters may forward the caller's token). */
  useCasesFor: (auth: RequestAuth) => UseCases;
  publicBaseUrl?: string;
  /** The OAuth authorization server; omitted only in tests that exercise /mcp alone. */
  oauth?: OAuthUseCases;
}

type Env = { Variables: { auth: RequestAuth } };

export function createMcpRoutes(deps: McpRouteDeps): Hono<Env> {
  const app = new Hono<Env>();

  app.use(
    "*",
    cors({
      // Native and server-side clients send no Origin; browsers only from claude.ai.
      origin: (origin) =>
        !origin || origin === "https://claude.ai" ? origin || "*" : null,
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Authorization",
        "Content-Type",
        "Accept",
        "Mcp-Session-Id",
        "Mcp-Protocol-Version",
      ],
      exposeHeaders: ["Mcp-Session-Id", "WWW-Authenticate"],
    }),
  );

  app.use("*", async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    // Auth schemes are case-insensitive (RFC 7235).
    const token = /^Bearer\s+(.+)$/i.exec(header)?.[1].trim() ?? "";
    const auth = token ? await deps.verifier.verify(token) : null;
    if (!auth) {
      const base = publicBaseUrl(c.req.raw, deps.publicBaseUrl);
      c.header(
        "WWW-Authenticate",
        `Bearer resource_metadata="${protectedResourceMetadataUrl(base)}"`,
      );
      return c.json({ error: "unauthorized" }, 401);
    }
    c.set("auth", { ...auth, accessToken: token });
    await next();
  });

  // Stateless: no standalone SSE stream (GET) and no sessions to end (DELETE).
  // Answer before building a transport so a GET can't hold a connection open.
  const methodNotAllowed = (c: Context<Env>) => {
    c.header("Allow", "POST");
    return c.json({ error: "method_not_allowed" }, 405);
  };
  app.get("/", methodNotAllowed);
  app.delete("/", methodNotAllowed);

  app.post("/", async (c) => {
    const auth = c.get("auth");
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createMcpServer(auth.userId, deps.useCasesFor(auth));
    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return c.json({ error: "Invalid JSON" }, 400);
      }
      throw error;
    }
  });

  return app;
}
