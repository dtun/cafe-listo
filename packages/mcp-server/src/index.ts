import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createSupabaseJwtVerifier } from "./auth/supabase-jwt-verifier";
import { loadConfig } from "./config";
import { supabaseOAuthUseCases, supabaseUseCasesFor } from "./container";
import { logError, logInfo } from "./lib/log";

const config = loadConfig(process.env);

if (config.missing.length > 0) {
  logError("config_incomplete", {
    missing: config.missing,
    effect: "/mcp is not mounted; /health serves, /ready returns 503",
  });
}

if (config.invalid.length > 0) {
  logError("config_invalid", {
    invalid: config.invalid,
    effect: "/mcp is not mounted; /health serves, /ready returns 503",
  });
}

const supabase = config.invalid.length === 0 ? config.supabase : undefined;

const app = createApp({
  mcp: supabase && {
    verifier: createSupabaseJwtVerifier({
      supabaseUrl: supabase.url,
      legacyJwtSecret: supabase.legacyJwtSecret,
    }),
    useCasesFor: supabaseUseCasesFor(supabase),
    publicBaseUrl: config.publicBaseUrl,
    oauth: supabaseOAuthUseCases(supabase),
  },
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  logInfo("listening", { port: info.port });
});
