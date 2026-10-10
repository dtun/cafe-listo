import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, rpc } from "../../__tests__/fakes/test-app";

const BASE = "http://localhost";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "v".repeat(64);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

type TestApp = ReturnType<typeof createTestApp>;

function form(path: string, fields: Record<string, string>) {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
}

async function register(
  app: TestApp["app"],
  body: Record<string, unknown> = {
    client_name: "Claude",
    redirect_uris: [REDIRECT],
  },
) {
  return app.fetch(
    new Request(`${BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function authorizeUrl(params: Record<string, string>) {
  return `${BASE}/authorize?${new URLSearchParams({
    response_type: "code",
    redirect_uri: REDIRECT,
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    state: "xyz",
    ...params,
  })}`;
}

function loginFields(clientId: string, overrides: Record<string, string> = {}) {
  return {
    email: "a@example.com",
    password: "pw",
    mode: "signin",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: CHALLENGE,
    state: "xyz",
    ...overrides,
  };
}

describe("OAuth flow", () => {
  let t: TestApp;
  let clientId: string;

  beforeEach(async () => {
    t = createTestApp();
    t.identity.addAccount("a@example.com", "pw", "alice");
    clientId = (await (await register(t.app)).json()).client_id;
  });

  async function loginForCode(): Promise<string> {
    const res = await t.app.fetch(form("/login", loginFields(clientId)));
    return new URL(res.headers.get("Location")!).searchParams.get("code")!;
  }

  function exchange(code: string, verifier = VERIFIER) {
    return t.app.fetch(
      form("/token", {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT,
        client_id: clientId,
        code_verifier: verifier,
      }),
    );
  }

  it("walks discovery → register → authorize → login → token → /mcp", async () => {
    const metadata = await (
      await t.app.fetch(
        new Request(`${BASE}/.well-known/oauth-authorization-server`),
      )
    ).json();
    expect(metadata.registration_endpoint).toBe(`${BASE}/register`);

    const page = await t.app.fetch(
      new Request(authorizeUrl({ client_id: clientId })),
    );
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Claude");
    expect(html).toContain("Cafe Listo");
    expect(html).toContain('action="/login"');

    const login = await t.app.fetch(form("/login", loginFields(clientId)));
    expect(login.status).toBe(302);
    const location = new URL(login.headers.get("Location")!);
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT);
    expect(location.searchParams.get("state")).toBe("xyz");
    const code = location.searchParams.get("code")!;

    const token = await exchange(code);
    expect(token.status).toBe(200);
    expect(token.headers.get("Cache-Control")).toBe("no-store");
    const tokens = await token.json();
    expect(tokens).toEqual({
      access_token: "token-for:alice",
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: expect.any(String),
    });

    const list = await t.app.fetch(
      rpc("tools/list", {}, { token: tokens.access_token }),
    );
    expect(list.status).toBe(200);
  });

  it("registers clients per RFC 7591", async () => {
    const res = await register(t.app);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      client_id: expect.any(String),
      client_id_issued_at: expect.any(Number),
      client_name: "Claude",
      redirect_uris: [REDIRECT],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });

  it.each([
    ["non-https", { redirect_uris: ["http://evil.example/cb"] }],
    ["missing", { client_name: "x" }],
    ["empty", { redirect_uris: [] }],
  ])("rejects %s redirect URIs at registration", async (_label, body) => {
    const res = await register(t.app, body);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_redirect_uri");
  });

  it("allows loopback http redirect URIs for local clients", async () => {
    const res = await register(t.app, {
      client_name: "Claude Code",
      redirect_uris: ["http://localhost:53682/callback"],
    });

    expect(res.status).toBe(201);
  });

  it("rejects code reuse", async () => {
    const code = await loginForCode();
    await exchange(code);

    const second = await exchange(code);

    expect(second.status).toBe(400);
    expect(await second.json()).toEqual({
      error: "invalid_grant",
      error_description: expect.any(String),
    });
  });

  it("rejects the wrong PKCE verifier", async () => {
    const res = await exchange(await loginForCode(), "w".repeat(64));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_grant");
  });

  it("never redirects to an unregistered redirect_uri", async () => {
    const res = await t.app.fetch(
      new Request(
        authorizeUrl({
          client_id: clientId,
          redirect_uri: "https://evil.example/cb",
        }),
      ),
    );

    expect(res.status).toBe(400);
    expect(res.headers.get("Location")).toBeNull();
  });

  it("does not redirect for an unknown client", async () => {
    const res = await t.app.fetch(
      new Request(authorizeUrl({ client_id: "nope" })),
    );

    expect(res.status).toBe(400);
    expect(res.headers.get("Location")).toBeNull();
  });

  it("redirects protocol errors back to a verified redirect_uri", async () => {
    const res = await t.app.fetch(
      new Request(
        authorizeUrl({ client_id: clientId, code_challenge_method: "plain" }),
      ),
    );

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("Location")!);
    expect(location.searchParams.get("error")).toBe("invalid_request");
    expect(location.searchParams.get("state")).toBe("xyz");
  });

  it("re-renders the login page on bad credentials", async () => {
    const res = await t.app.fetch(
      form("/login", loginFields(clientId, { password: "wrong" })),
    );

    expect(res.status).toBe(400);
    expect(res.headers.get("Location")).toBeNull();
    expect(await res.text()).toContain("Invalid email or password");
  });

  it("rejects a tampered redirect_uri at login", async () => {
    const res = await t.app.fetch(
      form(
        "/login",
        loginFields(clientId, { redirect_uri: "https://evil.example/cb" }),
      ),
    );

    expect(res.status).toBe(400);
    expect(res.headers.get("Location")).toBeNull();
  });

  it("escapes client-supplied names in the consent page", async () => {
    const evil = await (
      await register(t.app, {
        client_name: "<script>alert(1)</script>",
        redirect_uris: [REDIRECT],
      })
    ).json();

    const html = await (
      await t.app.fetch(
        new Request(authorizeUrl({ client_id: evil.client_id })),
      )
    ).text();

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("refreshes tokens", async () => {
    const tokens = await (await exchange(await loginForCode())).json();

    const res = await t.app.fetch(
      form("/token", {
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: clientId,
      }),
    );

    expect(res.status).toBe(200);
    const refreshed = await res.json();
    expect(refreshed.access_token).toBe("token-for:alice");
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);
  });

  it("rejects unsupported grant types", async () => {
    const res = await t.app.fetch(form("/token", { grant_type: "password" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unsupported_grant_type");
  });
});
