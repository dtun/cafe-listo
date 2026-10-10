import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { SupabaseIdentityProvider } from "../supabase-identity-provider";

vi.mock("../../../lib/log", () => ({ logInfo: vi.fn(), logError: vi.fn() }));

/** Says nothing about whether the email already has an account. */
const SIGN_UP_FAILED =
  "Couldn't create an account with that email and password. If you already have an account, sign in instead.";

const SESSION = {
  access_token: "at",
  refresh_token: "rt",
  expires_in: 3600,
  user: { id: "u1" },
};

function fakeAuth(auth: Record<string, unknown>) {
  return { auth } as unknown as SupabaseClient;
}

describe("SupabaseIdentityProvider", () => {
  it("maps a password sign-in to a session", async () => {
    const signInWithPassword = vi
      .fn()
      .mockResolvedValue({ data: { session: SESSION }, error: null });

    const result = await new SupabaseIdentityProvider(
      fakeAuth({ signInWithPassword }),
    ).signIn("a@example.com", "pw");

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "a@example.com",
      password: "pw",
    });
    expect(result).toEqual({
      ok: true,
      session: {
        userId: "u1",
        accessToken: "at",
        refreshToken: "rt",
        expiresIn: 3600,
      },
    });
  });

  it("returns a generic message for failed sign-in", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });

    const result = await new SupabaseIdentityProvider(
      fakeAuth({ signInWithPassword }),
    ).signIn("a@example.com", "wrong");

    expect(result).toEqual({ ok: false, message: "Invalid email or password" });
  });

  it("asks the user to confirm email when sign-up returns no session", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { session: null, user: { id: "u1" } },
      error: null,
    });

    const result = await new SupabaseIdentityProvider(
      fakeAuth({ signUp }),
    ).signUp("a@example.com", "pw");

    expect(result).toEqual({
      ok: false,
      message: "Check your email to confirm your account, then sign in.",
    });
  });

  it.each([
    "User already registered",
    "Password should be at least 6 characters.",
  ])(
    "replaces the sign-up error %j with a generic message",
    async (supabaseMessage) => {
      const signUp = vi.fn().mockResolvedValue({
        data: { session: null, user: null },
        error: { message: supabaseMessage, code: "x" },
      });

      const result = await new SupabaseIdentityProvider(
        fakeAuth({ signUp }),
      ).signUp("a@example.com", "pw");

      expect(result).toEqual({
        ok: false,
        message: SIGN_UP_FAILED,
      });
    },
  );

  it("refreshes a session", async () => {
    const refreshSession = vi
      .fn()
      .mockResolvedValue({ data: { session: SESSION }, error: null });

    const session = await new SupabaseIdentityProvider(
      fakeAuth({ refreshSession }),
    ).refresh("rt-old");

    expect(refreshSession).toHaveBeenCalledWith({ refresh_token: "rt-old" });
    expect(session?.accessToken).toBe("at");
  });

  it("returns null when refresh fails", async () => {
    const refreshSession = vi.fn().mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid Refresh Token" },
    });

    expect(
      await new SupabaseIdentityProvider(fakeAuth({ refreshSession })).refresh(
        "bad",
      ),
    ).toBeNull();
  });
});
