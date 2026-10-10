import { createHash, randomBytes } from "node:crypto";
import { fail, ok, type Clock, type UseCaseResult } from "../types";
import type {
  AuthCodeStore,
  IdentityProvider,
  OAuthClient,
  OAuthClientStore,
  Session,
} from "./ports";

const CODE_TTL_MS = 10 * 60 * 1000;

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pkceS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function tokenSet(session: Session): TokenSet {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresIn: session.expiresIn,
  };
}

export class RegisterClient {
  constructor(
    private readonly clients: OAuthClientStore,
    private readonly clock: Clock,
    private readonly randomToken: () => string,
  ) {}

  async execute(input: {
    clientName: string;
    redirectUris: string[];
  }): Promise<UseCaseResult<OAuthClient>> {
    const client: OAuthClient = {
      clientId: this.randomToken(),
      clientName: input.clientName,
      redirectUris: input.redirectUris,
      createdAt: this.clock.now(),
    };
    await this.clients.create(client);
    return ok(client);
  }
}

export class ValidateAuthorization {
  constructor(private readonly clients: OAuthClientStore) {}

  /** The client must be registered and redirect_uri must match a registered URI exactly. */
  async execute(input: {
    clientId: string;
    redirectUri: string;
  }): Promise<UseCaseResult<OAuthClient>> {
    const client = await this.clients.find(input.clientId);
    if (!client) return fail("not_found", "Unknown client");
    if (!client.redirectUris.includes(input.redirectUri)) {
      return fail(
        "unprocessable",
        "redirect_uri is not registered for this client",
      );
    }
    return ok(client);
  }
}

export interface SignInAndIssueCodeInput {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  email: string;
  password: string;
  mode: "signin" | "signup";
}

export class SignInAndIssueCode {
  constructor(
    private readonly validate: ValidateAuthorization,
    private readonly identity: IdentityProvider,
    private readonly codes: AuthCodeStore,
    private readonly clock: Clock,
    private readonly randomToken: () => string,
  ) {}

  async execute(
    input: SignInAndIssueCodeInput,
  ): Promise<UseCaseResult<{ code: string }>> {
    const authorization = await this.validate.execute(input);
    if (!authorization.ok) return authorization;

    const result =
      input.mode === "signup"
        ? await this.identity.signUp(input.email, input.password)
        : await this.identity.signIn(input.email, input.password);
    if (!result.ok) return fail("forbidden", result.message);

    const code = this.randomToken();
    await this.codes.save({
      codeHash: sha256Hex(code),
      clientId: input.clientId,
      userId: result.session.userId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      refreshToken: result.session.refreshToken,
      expiresAt: new Date(this.clock.now().getTime() + CODE_TTL_MS),
    });
    return ok({ code });
  }
}

export class ExchangeCode {
  constructor(
    private readonly codes: AuthCodeStore,
    private readonly identity: IdentityProvider,
    private readonly clock: Clock,
  ) {}

  /** Codes are single-use: consumed before any check, so a failed attempt burns them. */
  async execute(input: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<UseCaseResult<TokenSet>> {
    const record = await this.codes.consume(
      sha256Hex(input.code),
      this.clock.now(),
    );
    if (
      !record ||
      record.clientId !== input.clientId ||
      record.redirectUri !== input.redirectUri ||
      pkceS256(input.codeVerifier) !== record.codeChallenge
    ) {
      return fail(
        "forbidden",
        "Invalid, expired, or already used authorization code",
      );
    }

    const session = await this.identity.refresh(record.refreshToken);
    if (!session) return fail("forbidden", "Session is no longer valid");
    return ok(tokenSet(session));
  }
}

export class RefreshTokens {
  constructor(private readonly identity: IdentityProvider) {}

  async execute(input: {
    refreshToken: string;
  }): Promise<UseCaseResult<TokenSet>> {
    const session = await this.identity.refresh(input.refreshToken);
    if (!session) return fail("forbidden", "Invalid refresh token");
    return ok(tokenSet(session));
  }
}

export interface OAuthUseCases {
  registerClient: RegisterClient;
  validateAuthorization: ValidateAuthorization;
  signInAndIssueCode: SignInAndIssueCode;
  exchangeCode: ExchangeCode;
  refreshTokens: RefreshTokens;
}

export interface OAuthDeps {
  clients: OAuthClientStore;
  codes: AuthCodeStore;
  identity: IdentityProvider;
  clock: Clock;
  randomToken?: () => string;
}

export function buildOAuthUseCases(deps: OAuthDeps): OAuthUseCases {
  const randomToken =
    deps.randomToken ?? (() => randomBytes(32).toString("base64url"));
  const validateAuthorization = new ValidateAuthorization(deps.clients);
  return Object.freeze({
    registerClient: new RegisterClient(deps.clients, deps.clock, randomToken),
    validateAuthorization,
    signInAndIssueCode: new SignInAndIssueCode(
      validateAuthorization,
      deps.identity,
      deps.codes,
      deps.clock,
      randomToken,
    ),
    exchangeCode: new ExchangeCode(deps.codes, deps.identity, deps.clock),
    refreshTokens: new RefreshTokens(deps.identity),
  });
}
