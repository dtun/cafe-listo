import { describe, expect, it, vi } from "vitest";
import { fixedClock } from "../../../__tests__/fakes/fixed-clock";
import { logError } from "../../../lib/log";
import {
  SupabaseAuthCodeStore,
  SupabaseOAuthClientStore,
} from "../supabase-oauth-stores";
import { createFakeSupabase } from "./fake-supabase";

vi.mock("../../../lib/log", () => ({ logInfo: vi.fn(), logError: vi.fn() }));

const NOW = "2026-01-01T00:00:00.000Z";

const CLIENT_ROW = {
  client_id: "c1",
  client_name: "Claude",
  redirect_uris: ["https://claude.ai/cb"],
  created_at: "2026-01-01T00:00:00+00:00",
};

const CODE_ROW = {
  code_hash: "h1",
  client_id: "c1",
  user_id: "11111111-1111-1111-1111-111111111111",
  redirect_uri: "https://claude.ai/cb",
  code_challenge: "x".repeat(43),
  refresh_token: "r1",
  expires_at: "2026-01-01T00:10:00+00:00",
};

describe("SupabaseOAuthClientStore", () => {
  it("inserts a client row", async () => {
    const { client, calls } = createFakeSupabase();

    await new SupabaseOAuthClientStore(client).create({
      clientId: "c1",
      clientName: "Claude",
      redirectUris: ["https://claude.ai/cb"],
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

    expect(calls).toEqual([
      { method: "from", args: ["oauth_clients"] },
      {
        method: "insert",
        args: [{ ...CLIENT_ROW, created_at: "2026-01-01T00:00:00.000Z" }],
      },
    ]);
  });

  it("finds a client by id", async () => {
    const { client, calls } = createFakeSupabase({ data: CLIENT_ROW });

    const found = await new SupabaseOAuthClientStore(client).find("c1");

    expect(found).toEqual({
      clientId: "c1",
      clientName: "Claude",
      redirectUris: ["https://claude.ai/cb"],
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(calls.map((c) => c.method)).toEqual([
      "from",
      "select",
      "eq",
      "maybeSingle",
    ]);
  });

  it("returns null for an unknown client", async () => {
    const { client } = createFakeSupabase({ data: null });

    expect(await new SupabaseOAuthClientStore(client).find("nope")).toBeNull();
  });
});

describe("SupabaseAuthCodeStore", () => {
  const record = {
    codeHash: "h1",
    clientId: "c1",
    userId: CODE_ROW.user_id,
    redirectUri: "https://claude.ai/cb",
    codeChallenge: "x".repeat(43),
    refreshToken: "r1",
    expiresAt: new Date("2026-01-01T00:10:00Z"),
  };

  it("inserts a code row, then purges expired codes", async () => {
    const { client, calls } = createFakeSupabase();

    await new SupabaseAuthCodeStore(client, fixedClock(NOW)).save(record);

    expect(calls).toEqual([
      { method: "from", args: ["oauth_codes"] },
      {
        method: "insert",
        args: [{ ...CODE_ROW, expires_at: "2026-01-01T00:10:00.000Z" }],
      },
      { method: "from", args: ["oauth_codes"] },
      { method: "delete", args: [] },
      { method: "lt", args: ["expires_at", NOW] },
    ]);
  });

  it("throws when the insert fails and skips the purge", async () => {
    const { client, calls } = createFakeSupabase({
      error: { code: "23503", message: "fk violation" },
    });

    await expect(
      new SupabaseAuthCodeStore(client, fixedClock(NOW)).save(record),
    ).rejects.toThrow();
    expect(calls.map((c) => c.method)).toEqual(["from", "insert"]);
  });

  it("still saves when the purge fails, and logs it", async () => {
    vi.mocked(logError).mockClear();
    const { client } = createFakeSupabase([
      {},
      { error: { code: "57014", message: "statement timeout" } },
    ]);

    await expect(
      new SupabaseAuthCodeStore(client, fixedClock(NOW)).save(record),
    ).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(
      "oauth_codes_purge_failed",
      expect.objectContaining({ error: "statement timeout" }),
    );
  });

  it("consumes with a single delete-returning", async () => {
    const { client, calls } = createFakeSupabase({ data: [CODE_ROW] });

    const consumed = await new SupabaseAuthCodeStore(client).consume(
      "h1",
      new Date("2026-01-01T00:05:00Z"),
    );

    expect(consumed).toEqual(record);
    expect(calls.map((c) => c.method)).toEqual([
      "from",
      "delete",
      "eq",
      "select",
    ]);
  });

  it("burns but does not return an expired code", async () => {
    const { client } = createFakeSupabase({ data: [CODE_ROW] });

    expect(
      await new SupabaseAuthCodeStore(client).consume(
        "h1",
        new Date("2026-01-01T00:10:01Z"),
      ),
    ).toBeNull();
  });

  it("returns null when nothing matched", async () => {
    const { client } = createFakeSupabase({ data: [] });

    expect(
      await new SupabaseAuthCodeStore(client).consume("h1", new Date()),
    ).toBeNull();
  });
});
