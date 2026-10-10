export interface OAuthClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  createdAt: Date;
}

export interface OAuthClientStore {
  create(client: OAuthClient): Promise<void>;
  find(clientId: string): Promise<OAuthClient | null>;
}

export interface AuthCodeRecord {
  codeHash: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  /** The signed-in session's refresh token; exchanged once for fresh tokens. */
  refreshToken: string;
  expiresAt: Date;
}

export interface AuthCodeStore {
  save(record: AuthCodeRecord): Promise<void>;
  /** Atomically deletes and returns the record if it exists and has not expired. */
  consume(codeHash: string, now: Date): Promise<AuthCodeRecord | null>;
}

export interface Session {
  userId: string;
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires, as reported by the identity provider. */
  expiresIn: number;
}

export type SignInResult =
  | { ok: true; session: Session }
  | { ok: false; message: string };

export interface IdentityProvider {
  signIn(email: string, password: string): Promise<SignInResult>;
  signUp(email: string, password: string): Promise<SignInResult>;
  refresh(refreshToken: string): Promise<Session | null>;
}
