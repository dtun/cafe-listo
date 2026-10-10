import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  errors,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import { logError, logInfo } from "../lib/log";
import type { TokenVerifier } from "./types";

export interface SupabaseJwtVerifierConfig {
  supabaseUrl: string;
  /** Defaults to the project's published JWKS (fetched once, then cached). */
  jwks?: JWTVerifyGetKey;
  /** Only for projects still signing with the legacy shared secret (HS256). */
  legacyJwtSecret?: string;
}

type RejectionReason =
  | "expired"
  | "bad_signature"
  | "wrong_issuer"
  | "wrong_audience"
  | "invalid_claims"
  | "unsupported_alg"
  | "malformed"
  | "jwks_fetch_failed"
  | "hs256_not_configured"
  | "missing_subject"
  | "unknown";

/** Thrown inside verify() for rejections that jose does not raise itself. */
class Rejected extends Error {
  constructor(readonly reason: RejectionReason) {
    super(reason);
  }
}

const JWKS_FETCH_CODES = new Set([
  errors.JWKSTimeout.code,
  errors.JWKSInvalid.code,
  // jose raises the generic error for a non-200 JWKS response.
  errors.JOSEError.code,
]);

function classify(error: unknown, usedJwks: boolean): RejectionReason {
  if (error instanceof Rejected) return error.reason;
  if (!(error instanceof errors.JOSEError)) {
    // Network failures surface as plain errors (e.g. TypeError: fetch failed).
    return usedJwks ? "jwks_fetch_failed" : "unknown";
  }
  if (error instanceof errors.JWTExpired) return "expired";
  if (error instanceof errors.JWTClaimValidationFailed) {
    if (error.claim === "iss") return "wrong_issuer";
    if (error.claim === "aud") return "wrong_audience";
    return "invalid_claims";
  }
  if (
    error instanceof errors.JWSSignatureVerificationFailed ||
    error instanceof errors.JWKSNoMatchingKey
  ) {
    return "bad_signature";
  }
  if (
    error instanceof errors.JOSEAlgNotAllowed ||
    error instanceof errors.JOSENotSupported
  ) {
    return "unsupported_alg";
  }
  if (usedJwks && JWKS_FETCH_CODES.has(error.code)) return "jwks_fetch_failed";
  if (
    error instanceof errors.JWSInvalid ||
    error instanceof errors.JWTInvalid
  ) {
    return "malformed";
  }
  return "unknown";
}

/** Logs why a token was rejected. Never logs the token or its claims. */
function logRejection(reason: RejectionReason, error: unknown): void {
  const code = error instanceof errors.JOSEError ? error.code : undefined;
  if (reason === "jwks_fetch_failed") {
    logError("token_rejected", {
      reason,
      code,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  logInfo("token_rejected", { reason, ...(code && { code }) });
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
      let usedJwks = false;
      try {
        let header;
        try {
          header = decodeProtectedHeader(token);
        } catch {
          throw new Rejected("malformed");
        }
        let payload;
        if (header.alg === "HS256") {
          if (!secret) throw new Rejected("hs256_not_configured");
          ({ payload } = await jwtVerify(token, secret, {
            ...options,
            algorithms: ["HS256"],
          }));
        } else {
          usedJwks = true;
          ({ payload } = await jwtVerify(token, jwks, options));
        }
        if (typeof payload.sub !== "string" || !payload.sub) {
          throw new Rejected("missing_subject");
        }
        return { userId: payload.sub };
      } catch (error) {
        logRejection(classify(error, usedJwks), error);
        return null;
      }
    },
  };
}
