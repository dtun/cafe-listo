import { Hono, type Context } from "hono";
import { z } from "zod";
import type { OAuthUseCases } from "../usecases/oauth";
import { errorPage, loginPage } from "./oauth-pages";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isAllowedRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.hash) return false;
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname))
    );
  } catch {
    return false;
  }
}

const registerSchema = z.object({
  client_name: z.string().trim().min(1).max(200).optional(),
  redirect_uris: z.array(z.string().refine(isAllowedRedirectUri)).min(1),
});

const authorizeSchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256"),
  state: z.string().optional(),
  scope: z.string().optional(),
  // RFC 8707 resource indicator: accepted; tokens are Supabase JWTs and are not audience-bound.
  resource: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
  mode: z.enum(["signin", "signup"]),
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  code_challenge: z.string().min(43).max(128),
  state: z.string().optional(),
});

const tokenSchema = z.discriminatedUnion("grant_type", [
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string().min(1),
    redirect_uri: z.string().min(1),
    client_id: z.string().min(1),
    code_verifier: z.string().min(43).max(128),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(1),
    client_id: z.string().optional(),
  }),
]);

function oauthError(
  c: Context,
  error: string,
  description: string,
  status: 400 | 401 = 400,
) {
  c.header("Cache-Control", "no-store");
  return c.json({ error, error_description: description }, status);
}

function redirectWith(
  c: Context,
  redirectUri: string,
  params: Record<string, string | undefined>,
) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return c.redirect(url.toString(), 302);
}

async function readForm(c: Context): Promise<Record<string, unknown>> {
  if (c.req.header("Content-Type")?.includes("application/json")) {
    return (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  }
  return (await c.req.parseBody()) as Record<string, unknown>;
}

/** OAuth 2.1 authorization server: DCR, authorize + PKCE, login, token. */
export function createOAuthRoutes(oauth: OAuthUseCases): Hono {
  const app = new Hono();

  app.post("/register", async (c) => {
    const parsed = registerSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return oauthError(
        c,
        "invalid_redirect_uri",
        "redirect_uris must be a non-empty list of https or loopback http URLs",
      );
    }
    const result = await oauth.registerClient.execute({
      clientName: parsed.data.client_name ?? "MCP client",
      redirectUris: parsed.data.redirect_uris,
    });
    if (!result.ok)
      return oauthError(c, "invalid_client_metadata", result.error.message);
    const client = result.data;
    return c.json(
      {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      201,
    );
  });

  app.get("/authorize", async (c) => {
    const query = c.req.query();
    // Verify client + redirect_uri before anything else; never redirect to an unverified URI.
    const authorization = await oauth.validateAuthorization.execute({
      clientId: query.client_id ?? "",
      redirectUri: query.redirect_uri ?? "",
    });
    if (!authorization.ok) {
      return c.html(errorPage(authorization.error.message), 400);
    }

    const parsed = authorizeSchema.safeParse(query);
    if (!parsed.success) {
      return redirectWith(c, query.redirect_uri, {
        error: "invalid_request",
        error_description:
          "response_type=code and a S256 code_challenge are required",
        state: query.state,
      });
    }

    return c.html(
      loginPage({
        clientName: authorization.data.clientName,
        clientId: parsed.data.client_id,
        redirectUri: parsed.data.redirect_uri,
        codeChallenge: parsed.data.code_challenge,
        state: parsed.data.state,
      }),
    );
  });

  app.post("/login", async (c) => {
    const parsed = loginSchema.safeParse(await c.req.parseBody());
    if (!parsed.success) {
      return c.html(errorPage("The sign-in request was incomplete."), 400);
    }
    const input = parsed.data;

    const authorization = await oauth.validateAuthorization.execute({
      clientId: input.client_id,
      redirectUri: input.redirect_uri,
    });
    if (!authorization.ok) {
      return c.html(errorPage(authorization.error.message), 400);
    }

    const result = await oauth.signInAndIssueCode.execute({
      clientId: input.client_id,
      redirectUri: input.redirect_uri,
      codeChallenge: input.code_challenge,
      email: input.email,
      password: input.password,
      mode: input.mode,
    });
    if (!result.ok) {
      return c.html(
        loginPage({
          clientName: authorization.data.clientName,
          clientId: input.client_id,
          redirectUri: input.redirect_uri,
          codeChallenge: input.code_challenge,
          state: input.state,
          error: result.error.message,
        }),
        400,
      );
    }

    return redirectWith(c, input.redirect_uri, {
      code: result.data.code,
      state: input.state || undefined,
    });
  });

  app.post("/token", async (c) => {
    const body = await readForm(c);
    if (
      body.grant_type !== "authorization_code" &&
      body.grant_type !== "refresh_token"
    ) {
      return oauthError(c, "unsupported_grant_type", "Unsupported grant_type");
    }
    const parsed = tokenSchema.safeParse(body);
    if (!parsed.success) {
      return oauthError(c, "invalid_request", "Missing or invalid parameters");
    }

    const result =
      parsed.data.grant_type === "authorization_code"
        ? await oauth.exchangeCode.execute({
            code: parsed.data.code,
            clientId: parsed.data.client_id,
            redirectUri: parsed.data.redirect_uri,
            codeVerifier: parsed.data.code_verifier,
          })
        : await oauth.refreshTokens.execute({
            refreshToken: parsed.data.refresh_token,
          });
    if (!result.ok) return oauthError(c, "invalid_grant", result.error.message);

    c.header("Cache-Control", "no-store");
    return c.json({
      access_token: result.data.accessToken,
      token_type: "Bearer",
      expires_in: result.data.expiresIn,
      refresh_token: result.data.refreshToken,
    });
  });

  return app;
}
