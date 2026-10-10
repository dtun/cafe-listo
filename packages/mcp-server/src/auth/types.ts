export interface AuthContext {
  userId: string;
}

/** Verifies a bearer access token and resolves the caller. Returns null when invalid. */
export interface TokenVerifier {
  verify(token: string): Promise<AuthContext | null>;
}

/** The verified caller plus the raw token, for adapters that forward it (e.g. to RLS). */
export interface RequestAuth extends AuthContext {
  accessToken: string;
}
