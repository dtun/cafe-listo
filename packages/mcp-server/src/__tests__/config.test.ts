import { describe, expect, it } from "vitest";
import { loadConfig } from "../config";

describe("loadConfig", () => {
  it("reads a complete environment", () => {
    expect(
      loadConfig({
        PORT: "8080",
        SUPABASE_URL: "https://p.supabase.co/",
        SUPABASE_ANON_KEY: "anon",
        SUPABASE_JWT_SECRET: "legacy",
        PUBLIC_BASE_URL: "https://mcp.example.com",
      }),
    ).toEqual({
      port: 8080,
      publicBaseUrl: "https://mcp.example.com",
      supabase: {
        url: "https://p.supabase.co",
        anonKey: "anon",
        legacyJwtSecret: "legacy",
      },
      missing: [],
    });
  });

  it("reports missing required variables instead of throwing", () => {
    const config = loadConfig({});

    expect(config.port).toBe(3000);
    expect(config.supabase).toBeUndefined();
    expect(config.missing).toEqual(["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
  });

  it("treats blank values as missing", () => {
    expect(
      loadConfig({ SUPABASE_URL: " ", SUPABASE_ANON_KEY: "anon" }).missing,
    ).toEqual(["SUPABASE_URL"]);
  });
});
