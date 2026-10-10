import type {
  AuthCodeRecord,
  AuthCodeStore,
  IdentityProvider,
  OAuthClient,
  OAuthClientStore,
  Session,
} from "../../usecases/oauth/ports";

export class InMemoryOAuthClientStore implements OAuthClientStore {
  clients = new Map<string, OAuthClient>();

  async create(client: OAuthClient): Promise<void> {
    this.clients.set(client.clientId, client);
  }

  async find(clientId: string): Promise<OAuthClient | null> {
    return this.clients.get(clientId) ?? null;
  }
}

/** Mirrors the table: consume is an atomic delete-returning that ignores expired rows. */
export class InMemoryAuthCodeStore implements AuthCodeStore {
  codes = new Map<string, AuthCodeRecord>();

  async save(record: AuthCodeRecord): Promise<void> {
    this.codes.set(record.codeHash, record);
  }

  async consume(codeHash: string, now: Date): Promise<AuthCodeRecord | null> {
    const record = this.codes.get(codeHash);
    this.codes.delete(codeHash);
    return record && record.expiresAt > now ? record : null;
  }
}

/**
 * Accounts keyed by email. Access tokens look like "token-for:<userId>" so the
 * fake token verifier accepts them; refresh tokens rotate on every use.
 */
export class FakeIdentityProvider implements IdentityProvider {
  private accounts = new Map<string, { password: string; userId: string }>();
  private refreshTokens = new Map<string, string>();
  private counter = 0;

  addAccount(email: string, password: string, userId: string): void {
    this.accounts.set(email, { password, userId });
  }

  private session(userId: string): Session {
    const refreshToken = `refresh-${++this.counter}`;
    this.refreshTokens.set(refreshToken, userId);
    return {
      userId,
      accessToken: `token-for:${userId}`,
      refreshToken,
      expiresIn: 3600,
    };
  }

  async signIn(email: string, password: string) {
    const account = this.accounts.get(email);
    if (!account || account.password !== password) {
      return { ok: false as const, message: "Invalid email or password" };
    }
    return { ok: true as const, session: this.session(account.userId) };
  }

  async signUp(email: string, password: string) {
    if (this.accounts.has(email)) {
      return { ok: false as const, message: "Account already exists" };
    }
    const userId = `user-${this.accounts.size + 1}`;
    this.addAccount(email, password, userId);
    return { ok: true as const, session: this.session(userId) };
  }

  async refresh(refreshToken: string): Promise<Session | null> {
    const userId = this.refreshTokens.get(refreshToken);
    if (!userId) return null;
    this.refreshTokens.delete(refreshToken);
    return this.session(userId);
  }
}
