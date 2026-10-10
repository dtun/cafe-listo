import { beforeAll, describe, expect, it } from "vitest";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type CryptoKey,
} from "jose";
import { createSupabaseJwtVerifier } from "../supabase-jwt-verifier";

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
  });

  it("rejects the wrong issuer", async () => {
    const token = await sign(
      {},
      { issuer: "https://other.supabase.co/auth/v1" },
    );

    expect(await verifier().verify(token)).toBeNull();
  });

  it("rejects the wrong audience", async () => {
    expect(
      await verifier().verify(await sign({}, { audience: "anon" })),
    ).toBeNull();
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
  });

  it("rejects garbage", async () => {
    expect(await verifier().verify("not-a-jwt")).toBeNull();
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
  });
});
