import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  FakeIdentityProvider,
  InMemoryAuthCodeStore,
  InMemoryOAuthClientStore,
} from "../../../__tests__/fakes/in-memory-oauth-stores";
import type { Clock } from "../../types";
import { buildOAuthUseCases, type OAuthUseCases } from "../index";

const VERIFIER = "a".repeat(64);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

describe("OAuth use cases", () => {
  let now: Date;
  let clients: InMemoryOAuthClientStore;
  let codes: InMemoryAuthCodeStore;
  let identity: FakeIdentityProvider;
  let oauth: OAuthUseCases;

  beforeEach(() => {
    now = new Date("2026-01-01T00:00:00Z");
    const clock: Clock = { now: () => now };
    clients = new InMemoryOAuthClientStore();
    codes = new InMemoryAuthCodeStore();
    identity = new FakeIdentityProvider();
    identity.addAccount("a@example.com", "pw", "alice");
    let n = 0;
    oauth = buildOAuthUseCases({
      clients,
      codes,
      identity,
      clock,
      randomToken: () => `random-${++n}`,
    });
  });

  async function registerClaude() {
    const result = await oauth.registerClient.execute({
      clientName: "Claude",
      redirectUris: [REDIRECT],
    });
    if (!result.ok) throw new Error("register failed");
    return result.data;
  }

  async function issueCode(clientId: string) {
    const result = await oauth.signInAndIssueCode.execute({
      clientId,
      redirectUri: REDIRECT,
      codeChallenge: CHALLENGE,
      email: "a@example.com",
      password: "pw",
      mode: "signin",
    });
    if (!result.ok) throw new Error(result.error.message);
    return result.data.code;
  }

  describe("registerClient", () => {
    it("persists a client with a generated id", async () => {
      const client = await registerClaude();

      expect(client).toEqual({
        clientId: "random-1",
        clientName: "Claude",
        redirectUris: [REDIRECT],
        createdAt: now,
      });
      expect(await clients.find("random-1")).toEqual(client);
    });
  });

  describe("validateAuthorization", () => {
    it("accepts a registered client with an exact redirect match", async () => {
      const client = await registerClaude();

      const result = await oauth.validateAuthorization.execute({
        clientId: client.clientId,
        redirectUri: REDIRECT,
      });

      expect(result).toEqual({ ok: true, data: client });
    });

    it("rejects an unknown client", async () => {
      const result = await oauth.validateAuthorization.execute({
        clientId: "nope",
        redirectUri: REDIRECT,
      });

      expect(result.ok).toBe(false);
    });

    it("rejects a redirect_uri that is not registered exactly", async () => {
      const client = await registerClaude();

      for (const redirectUri of [
        `${REDIRECT}/extra`,
        "https://evil.example/callback",
        REDIRECT.replace("https", "http"),
      ]) {
        const result = await oauth.validateAuthorization.execute({
          clientId: client.clientId,
          redirectUri,
        });
        expect(result.ok).toBe(false);
      }
    });
  });

  describe("signInAndIssueCode", () => {
    it("stores only a hash of the code with a 10 minute expiry", async () => {
      const client = await registerClaude();

      const code = await issueCode(client.clientId);

      const [record] = [...codes.codes.values()];
      expect(record.codeHash).toBe(
        createHash("sha256").update(code).digest("hex"),
      );
      expect(record.codeHash).not.toBe(code);
      expect(record).toMatchObject({
        clientId: client.clientId,
        userId: "alice",
        redirectUri: REDIRECT,
        codeChallenge: CHALLENGE,
        expiresAt: new Date("2026-01-01T00:10:00Z"),
      });
    });

    it("rejects bad credentials", async () => {
      const client = await registerClaude();

      const result = await oauth.signInAndIssueCode.execute({
        clientId: client.clientId,
        redirectUri: REDIRECT,
        codeChallenge: CHALLENGE,
        email: "a@example.com",
        password: "wrong",
        mode: "signin",
      });

      expect(result).toEqual({
        ok: false,
        error: { code: "forbidden", message: "Invalid email or password" },
      });
      expect(codes.codes.size).toBe(0);
    });

    it("signs up new accounts", async () => {
      const client = await registerClaude();

      const result = await oauth.signInAndIssueCode.execute({
        clientId: client.clientId,
        redirectUri: REDIRECT,
        codeChallenge: CHALLENGE,
        email: "new@example.com",
        password: "pw",
        mode: "signup",
      });

      expect(result.ok).toBe(true);
    });

    it("re-validates the client and redirect", async () => {
      const result = await oauth.signInAndIssueCode.execute({
        clientId: "nope",
        redirectUri: REDIRECT,
        codeChallenge: CHALLENGE,
        email: "a@example.com",
        password: "pw",
        mode: "signin",
      });

      expect(result.ok).toBe(false);
    });
  });

  describe("exchangeCode", () => {
    it("returns fresh tokens for a valid code and verifier", async () => {
      const client = await registerClaude();
      const code = await issueCode(client.clientId);

      const result = await oauth.exchangeCode.execute({
        code,
        clientId: client.clientId,
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
      });

      expect(result).toEqual({
        ok: true,
        data: {
          accessToken: "token-for:alice",
          refreshToken: expect.any(String),
          expiresIn: 3600,
        },
      });
    });

    it("rejects reuse of a code", async () => {
      const client = await registerClaude();
      const code = await issueCode(client.clientId);
      const input = {
        code,
        clientId: client.clientId,
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
      };
      await oauth.exchangeCode.execute(input);

      const second = await oauth.exchangeCode.execute(input);

      expect(second.ok).toBe(false);
    });

    it("rejects a wrong verifier and burns the code", async () => {
      const client = await registerClaude();
      const code = await issueCode(client.clientId);

      const wrong = await oauth.exchangeCode.execute({
        code,
        clientId: client.clientId,
        redirectUri: REDIRECT,
        codeVerifier: "b".repeat(64),
      });
      const retry = await oauth.exchangeCode.execute({
        code,
        clientId: client.clientId,
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
      });

      expect(wrong.ok).toBe(false);
      expect(retry.ok).toBe(false);
    });

    it("rejects a mismatched client or redirect", async () => {
      const client = await registerClaude();

      const wrongClient = await oauth.exchangeCode.execute({
        code: await issueCode(client.clientId),
        clientId: "other",
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
      });
      const wrongRedirect = await oauth.exchangeCode.execute({
        code: await issueCode(client.clientId),
        clientId: client.clientId,
        redirectUri: "https://claude.ai/other",
        codeVerifier: VERIFIER,
      });

      expect(wrongClient.ok).toBe(false);
      expect(wrongRedirect.ok).toBe(false);
    });

    it("rejects an expired code", async () => {
      const client = await registerClaude();
      const code = await issueCode(client.clientId);
      now = new Date("2026-01-01T00:10:01Z");

      const result = await oauth.exchangeCode.execute({
        code,
        clientId: client.clientId,
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
      });

      expect(result.ok).toBe(false);
    });
  });

  describe("refreshTokens", () => {
    it("rotates tokens", async () => {
      const client = await registerClaude();
      const exchanged = await oauth.exchangeCode.execute({
        code: await issueCode(client.clientId),
        clientId: client.clientId,
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
      });
      if (!exchanged.ok) throw new Error("exchange failed");

      const refreshed = await oauth.refreshTokens.execute({
        refreshToken: exchanged.data.refreshToken,
      });

      expect(refreshed.ok).toBe(true);
      if (!refreshed.ok) return;
      expect(refreshed.data.refreshToken).not.toBe(exchanged.data.refreshToken);
    });

    it("rejects an unknown refresh token", async () => {
      const result = await oauth.refreshTokens.execute({
        refreshToken: "nope",
      });

      expect(result.ok).toBe(false);
    });
  });
});
