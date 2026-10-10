import { describe, expect, it } from "vitest";
import { createTestApp } from "../../__tests__/fakes/test-app";

function get(path: string, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, { headers });
}

const FORWARDED = {
  "X-Forwarded-Proto": "https",
  "X-Forwarded-Host": "mcp.example.com",
};

describe("GET /.well-known/oauth-protected-resource", () => {
  it.each([
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
  ])("describes /mcp at %s with string issuers", async (path) => {
    const { app } = createTestApp();

    const res = await app.fetch(get(path, FORWARDED));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      resource: "https://mcp.example.com/mcp",
      authorization_servers: ["https://mcp.example.com"],
      bearer_methods_supported: ["header"],
    });
  });
});

describe("GET /.well-known/oauth-authorization-server", () => {
  it("advertises the OAuth endpoints over https behind a proxy", async () => {
    const { app } = createTestApp();

    const res = await app.fetch(
      get("/.well-known/oauth-authorization-server", FORWARDED),
    );

    expect(await res.json()).toEqual({
      issuer: "https://mcp.example.com",
      authorization_endpoint: "https://mcp.example.com/authorize",
      token_endpoint: "https://mcp.example.com/token",
      registration_endpoint: "https://mcp.example.com/register",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });

  it("falls back to the request URL without forwarded headers", async () => {
    const { app } = createTestApp();

    const res = await app.fetch(get("/.well-known/oauth-authorization-server"));

    expect((await res.json()).issuer).toBe("http://localhost");
  });
});
