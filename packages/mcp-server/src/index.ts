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
    effect: "/mcp is not mounted; /health still serves",
  });
}

const app = createApp({
  mcp: config.supabase && {
    verifier: createSupabaseJwtVerifier({
      supabaseUrl: config.supabase.url,
      legacyJwtSecret: config.supabase.legacyJwtSecret,
    }),
    useCasesFor: supabaseUseCasesFor(config.supabase),
    publicBaseUrl: config.publicBaseUrl,
    oauth: supabaseOAuthUseCases(config.supabase),
  },
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  logInfo("listening", { port: info.port });
});
