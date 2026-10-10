import { RepositoryError } from "@cafe-listo/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { logError } from "../../lib/log";
import type {
  AuthCodeRecord,
  AuthCodeStore,
  OAuthClient,
  OAuthClientStore,
} from "../../usecases/oauth/ports";
import { systemClock, type Clock } from "../../usecases/types";
import type { Database } from "./database.types";
import { toRepositoryError } from "./errors";

const timestamp = z.iso.datetime({ offset: true });

const clientRowSchema = z.object({
  client_id: z.string(),
  client_name: z.string(),
  redirect_uris: z.array(z.string()),
  created_at: timestamp,
});

const codeRowSchema = z.object({
  code_hash: z.string(),
  client_id: z.string(),
  user_id: z.string(),
  redirect_uri: z.string(),
  code_challenge: z.string(),
  refresh_token: z.string(),
  expires_at: timestamp,
});

function parseRow<T>(schema: z.ZodType<T>, row: unknown, table: string): T {
  const parsed = schema.safeParse(row);
  if (!parsed.success) {
    throw new RepositoryError(
      "INVALID_ROW",
      `${table} row failed validation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/** Service-role only: these tables have RLS enabled with no policies. */
export class SupabaseOAuthClientStore implements OAuthClientStore {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async create(client: OAuthClient): Promise<void> {
    const { error } = await this.client.from("oauth_clients").insert({
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      created_at: client.createdAt.toISOString(),
    });
    if (error) throw toRepositoryError(error);
  }

  async find(clientId: string): Promise<OAuthClient | null> {
    const { data, error } = await this.client
      .from("oauth_clients")
      .select("client_id, client_name, redirect_uris, created_at")
      .eq("client_id", clientId)
      .maybeSingle();
    if (error) throw toRepositoryError(error);
    if (!data) return null;
    const row = parseRow(clientRowSchema, data, "oauth_clients");
    return {
      clientId: row.client_id,
      clientName: row.client_name,
      redirectUris: row.redirect_uris,
      createdAt: new Date(row.created_at),
    };
  }
}

export class SupabaseAuthCodeStore implements AuthCodeStore {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly clock: Clock = systemClock,
  ) {}

  async save(record: AuthCodeRecord): Promise<void> {
    const { error } = await this.client.from("oauth_codes").insert({
      code_hash: record.codeHash,
      client_id: record.clientId,
      user_id: record.userId,
      redirect_uri: record.redirectUri,
      code_challenge: record.codeChallenge,
      refresh_token: record.refreshToken,
      expires_at: record.expiresAt.toISOString(),
    });
    if (error) throw toRepositoryError(error);
    await this.purgeExpired();
  }

  /**
   * Abandoned flows leave codes behind, each holding a live refresh token.
   * Best-effort: a failed purge is logged and retried on the next save.
   */
  private async purgeExpired(): Promise<void> {
    let message: string | undefined;
    try {
      const { error } = await this.client
        .from("oauth_codes")
        .delete()
        .lt("expires_at", this.clock.now().toISOString());
      message = error?.message;
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    if (message) logError("oauth_codes_purge_failed", { error: message });
  }

  /** One DELETE ... RETURNING, so two concurrent exchanges can't both win. Expired codes are burned too. */
  async consume(codeHash: string, now: Date): Promise<AuthCodeRecord | null> {
    const { data, error } = await this.client
      .from("oauth_codes")
      .delete()
      .eq("code_hash", codeHash)
      .select(
        "code_hash, client_id, user_id, redirect_uri, code_challenge, refresh_token, expires_at",
      );
    if (error) throw toRepositoryError(error);
    const [first] = data ?? [];
    if (!first) return null;
    const row = parseRow(codeRowSchema, first, "oauth_codes");
    const expiresAt = new Date(row.expires_at);
    if (expiresAt <= now) return null;
    return {
      codeHash: row.code_hash,
      clientId: row.client_id,
      userId: row.user_id,
      redirectUri: row.redirect_uri,
      codeChallenge: row.code_challenge,
      refreshToken: row.refresh_token,
      expiresAt,
    };
  }
}
