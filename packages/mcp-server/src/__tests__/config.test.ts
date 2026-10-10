import { describe, expect, it } from "vitest";
import { loadConfig } from "../config";

describe("loadConfig", () => {
  it("reads a complete environment", () => {
    expect(
      loadConfig({
        PORT: "8080",
        SUPABASE_URL: "https://p.supabase.co/",
        SUPABASE_ANON_KEY: "anon",
        SUPABASE_SERVICE_ROLE_KEY: "service",
        SUPABASE_JWT_SECRET: "legacy",
        PUBLIC_BASE_URL: "https://mcp.example.com",
      }),
    ).toEqual({
      port: 8080,
      publicBaseUrl: "https://mcp.example.com",
      supabase: {
        url: "https://p.supabase.co",
        anonKey: "anon",
        serviceRoleKey: "service",
        legacyJwtSecret: "legacy",
      },
      missing: [],
      invalid: [],
    });
  });

  it("reports missing required variables instead of throwing", () => {
    const config = loadConfig({});

    expect(config.port).toBe(3000);
    expect(config.supabase).toBeUndefined();
    expect(config.missing).toEqual([
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  });

  it("treats blank values as missing", () => {
    expect(
      loadConfig({
        SUPABASE_URL: " ",
        SUPABASE_ANON_KEY: "anon",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      }).missing,
    ).toEqual(["SUPABASE_URL"]);
  });

  it("normalizes PUBLIC_BASE_URL to its origin", () => {
    const config = loadConfig({ PUBLIC_BASE_URL: "https://mcp.example.com/" });

    expect(config.publicBaseUrl).toBe("https://mcp.example.com");
    expect(config.invalid).toEqual([]);
  });

  it.each([
    "mcp.example.com",
    "/mcp",
    "ftp://mcp.example.com",
    "https://mcp.example.com/base",
    "https://mcp.example.com?x=1",
    "https://mcp.example.com/#frag",
  ])("reports an invalid PUBLIC_BASE_URL: %s", (value) => {
    const config = loadConfig({ PUBLIC_BASE_URL: value });

    expect(config.publicBaseUrl).toBeUndefined();
    expect(config.invalid).toEqual(["PUBLIC_BASE_URL"]);
  });
});
