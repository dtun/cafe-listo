import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLocalJWKSet,
  errors,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type CryptoKey,
} from "jose";
import { logError, logInfo } from "../../lib/log";
import { createSupabaseJwtVerifier } from "../supabase-jwt-verifier";

vi.mock("../../lib/log", () => ({ logInfo: vi.fn(), logError: vi.fn() }));

beforeEach(() => {
  vi.mocked(logInfo).mockClear();
  vi.mocked(logError).mockClear();
});

/** The logged rejection; also asserts the token itself never reaches the logs. */
function rejection(token: string) {
  const calls = [
    ...vi.mocked(logInfo).mock.calls,
    ...vi.mocked(logError).mock.calls,
  ];
  expect(JSON.stringify(calls)).not.toContain(token);
  const call = calls.find(([message]) => message === "token_rejected");
  return call?.[1] as { reason: string } | undefined;
}

const SUPABASE_URL = "https://project.supabase.co";
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const USER = "11111111-1111-1111-1111-111111111111";

let privateKey: CryptoKey;
let publicJwk: JWK;

beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "ES256" };
});

function sign(
  claims: Record<string, unknown> = {},
  opts: { issuer?: string; audience?: string; expiresIn?: string } = {},
) {
  return new SignJWT({ role: "authenticated", ...claims })
    .setProtectedHeader({ alg: "ES256", kid: "k1" })
    .setSubject(USER)
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? "authenticated")
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "1h")
    .sign(privateKey);
}

function verifier() {
  return createSupabaseJwtVerifier({
    supabaseUrl: SUPABASE_URL,
    jwks: createLocalJWKSet({ keys: [publicJwk] }),
  });
}

describe("createSupabaseJwtVerifier", () => {
  it("resolves the user from a valid token", async () => {
    expect(await verifier().verify(await sign())).toEqual({ userId: USER });
  });

  it("rejects an expired token", async () => {
    const token = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setSubject(USER)
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);

    expect(await verifier().verify(token)).toBeNull();
    expect(rejection(token)?.reason).toBe("expired");
    expect(logInfo).toHaveBeenCalledWith(
      "token_rejected",
      expect.objectContaining({ reason: "expired" }),
    );
  });

  it("rejects the wrong issuer", async () => {
    const token = await sign(
      {},
      { issuer: "https://other.supabase.co/auth/v1" },
    );

    expect(await verifier().verify(token)).toBeNull();
    expect(rejection(token)?.reason).toBe("wrong_issuer");
  });

  it("rejects the wrong audience", async () => {
    const token = await sign({}, { audience: "anon" });

    expect(await verifier().verify(token)).toBeNull();
    expect(rejection(token)?.reason).toBe("wrong_audience");
  });

  it("rejects a token signed by an unknown key", async () => {
    const other = await generateKeyPair("ES256");
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setSubject(USER)
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(other.privateKey);

    expect(await verifier().verify(token)).toBeNull();
    expect(rejection(token)?.reason).toBe("bad_signature");
  });

  it("rejects garbage", async () => {
    expect(await verifier().verify("not-a-jwt")).toBeNull();
    expect(rejection("not-a-jwt")?.reason).toBe("malformed");
  });

  it("logs JWKS fetch failures at error level", async () => {
    const token = await sign();
    for (const failure of [
      new errors.JWKSTimeout(),
      new TypeError("fetch failed"),
    ]) {
      vi.mocked(logError).mockClear();
      const broken = createSupabaseJwtVerifier({
        supabaseUrl: SUPABASE_URL,
        jwks: async () => {
          throw failure;
        },
      });

      expect(await broken.verify(token)).toBeNull();
      expect(logError).toHaveBeenCalledWith(
        "token_rejected",
        expect.objectContaining({ reason: "jwks_fetch_failed" }),
      );
      expect(rejection(token)?.reason).toBe("jwks_fetch_failed");
    }
  });

  it("verifies legacy HS256 tokens when a JWT secret is configured", async () => {
    const secret = "super-secret-jwt-token-with-at-least-32-characters";
    const token = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(USER)
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(secret));

    const withSecret = createSupabaseJwtVerifier({
      supabaseUrl: SUPABASE_URL,
      jwks: createLocalJWKSet({ keys: [publicJwk] }),
      legacyJwtSecret: secret,
    });

    expect(await withSecret.verify(token)).toEqual({ userId: USER });
    expect(await verifier().verify(token)).toBeNull();
    expect(rejection(token)?.reason).toBe("hs256_not_configured");
  });

  it("does not log accepted tokens", async () => {
    await verifier().verify(await sign());

    expect(logInfo).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });
});
