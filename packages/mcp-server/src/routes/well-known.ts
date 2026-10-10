import { Hono } from "hono";
import { publicBaseUrl } from "../lib/base-url";

/** OAuth discovery: RFC 9728 protected-resource and RFC 8414 authorization-server metadata. */
export function createWellKnownRoutes(
  opts: { publicBaseUrl?: string } = {},
): Hono {
  const app = new Hono();

  const protectedResource = (req: Request) => {
    const base = publicBaseUrl(req, opts.publicBaseUrl);
    return {
      resource: `${base}/mcp`,
      // An array of issuer URL strings, not objects.
      authorization_servers: [base],
      bearer_methods_supported: ["header"],
    };
  };

  app.get("/oauth-protected-resource", (c) =>
    c.json(protectedResource(c.req.raw)),
  );
  app.get("/oauth-protected-resource/mcp", (c) =>
    c.json(protectedResource(c.req.raw)),
  );

  app.get("/oauth-authorization-server", (c) => {
    const base = publicBaseUrl(c.req.raw, opts.publicBaseUrl);
    return c.json({
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });

  return app;
}
