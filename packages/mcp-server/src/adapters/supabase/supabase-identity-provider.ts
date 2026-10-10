import type {
  Session as SupabaseSession,
  SupabaseClient,
} from "@supabase/supabase-js";
import { logInfo } from "../../lib/log";
import type {
  IdentityProvider,
  Session,
  SignInResult,
} from "../../usecases/oauth/ports";

const SIGN_UP_FAILED =
  "Couldn't create an account with that email and password. If you already have an account, sign in instead.";

function toSession(session: SupabaseSession): Session {
  return {
    userId: session.user.id,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in,
  };
}

/** Supabase Auth behind the IdentityProvider port. Uses an anon-key client with no persisted session. */
export class SupabaseIdentityProvider implements IdentityProvider {
  constructor(private readonly client: SupabaseClient) {}

  async signIn(email: string, password: string): Promise<SignInResult> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session) {
      return { ok: false, message: "Invalid email or password" };
    }
    return { ok: true, session: toSession(data.session) };
  }

  async signUp(email: string, password: string): Promise<SignInResult> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) {
      // Supabase's message can reveal whether the email is registered; log the code, show a generic message.
      logInfo("sign_up_failed", { code: error.code, status: error.status });
      return { ok: false, message: SIGN_UP_FAILED };
    }
    if (!data.session) {
      return {
        ok: false,
        message: "Check your email to confirm your account, then sign in.",
      };
    }
    return { ok: true, session: toSession(data.session) };
  }

  async refresh(refreshToken: string): Promise<Session | null> {
    const { data, error } = await this.client.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data.session) return null;
    return toSession(data.session);
  }
}
