type Env = Record<string, string | undefined>;

export interface Config {
  port: number;
  publicBaseUrl?: string;
  supabase?: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
    legacyJwtSecret?: string;
  };
  /** Required variables that are unset; /mcp stays unmounted until they are provided. */
  missing: string[];
  /** Variables that are set but malformed; /mcp stays unmounted until they are fixed. */
  invalid: string[];
}

const REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

function read(env: Env, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

/** An absolute http(s) origin with no path, query, or fragment, normalized without a trailing slash. */
function parseBaseUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    const isHttp = url.protocol === "https:" || url.protocol === "http:";
    if (!isHttp || url.pathname !== "/" || url.search || url.hash) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

export function loadConfig(env: Env): Config {
  const missing = REQUIRED.filter((key) => !read(env, key));
  const url = read(env, "SUPABASE_URL");
  const anonKey = read(env, "SUPABASE_ANON_KEY");
  const serviceRoleKey = read(env, "SUPABASE_SERVICE_ROLE_KEY");
  const legacyJwtSecret = read(env, "SUPABASE_JWT_SECRET");
  const rawBaseUrl = read(env, "PUBLIC_BASE_URL");
  const publicBaseUrl = rawBaseUrl && parseBaseUrl(rawBaseUrl);
  const invalid = rawBaseUrl && !publicBaseUrl ? ["PUBLIC_BASE_URL"] : [];

  return {
    port: Number(read(env, "PORT")) || 3000,
    ...(publicBaseUrl && { publicBaseUrl }),
    ...(url &&
      anonKey &&
      serviceRoleKey && {
        supabase: {
          url: url.replace(/\/+$/, ""),
          anonKey,
          serviceRoleKey,
          ...(legacyJwtSecret && { legacyJwtSecret }),
        },
      }),
    missing,
    invalid,
  };
}
