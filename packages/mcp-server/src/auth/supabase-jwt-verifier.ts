import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import type { TokenVerifier } from "./types";

export interface SupabaseJwtVerifierConfig {
  supabaseUrl: string;
  /** Defaults to the project's published JWKS (fetched once, then cached). */
  jwks?: JWTVerifyGetKey;
  /** Only for projects still signing with the legacy shared secret (HS256). */
  legacyJwtSecret?: string;
}

/**
 * Verifies Supabase access tokens locally — no auth-server round-trip per
 * MCP call. Checks signature, issuer, audience, and expiry.
 */
export function createSupabaseJwtVerifier(
  config: SupabaseJwtVerifierConfig,
): TokenVerifier {
  const base = config.supabaseUrl.replace(/\/+$/, "");
  const issuer = `${base}/auth/v1`;
  const jwks =
    config.jwks ??
    createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const secret = config.legacyJwtSecret
    ? new TextEncoder().encode(config.legacyJwtSecret)
    : null;
  const options = { issuer, audience: "authenticated" };

  return {
    async verify(token) {
      try {
        const { alg } = decodeProtectedHeader(token);
        const { payload } =
          alg === "HS256"
            ? secret
              ? await jwtVerify(token, secret, {
                  ...options,
                  algorithms: ["HS256"],
                })
              : { payload: null }
            : await jwtVerify(token, jwks, options);
        return typeof payload?.sub === "string" && payload.sub
          ? { userId: payload.sub }
          : null;
      } catch {
        return null;
      }
    },
  };
}
