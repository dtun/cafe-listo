import { describe, expect, it } from "vitest";
import { createTestApp } from "../../__tests__/fakes/test-app";
import { OAUTH_RATE_LIMITS } from "../oauth";

const BASE = "http://localhost";

function manualClock() {
  let now = Date.parse("2026-01-01T00:00:00Z");
  return {
    now: () => new Date(now),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function fromIp(ip: string, path: string, init: RequestInit): Request {
  const req = new Request(`${BASE}${path}`, init);
  req.headers.set("X-Forwarded-For", `${ip}, 10.0.0.1`);
  return req;
}

const requests = {
  register: (ip: string) =>
    fromIp(ip, "/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["https://claude.ai/cb"] }),
    }),
  token: (ip: string) =>
    fromIp(ip, "/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token" }),
    }),
  login: (ip: string) =>
    fromIp(ip, "/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: "a@example.com" }),
    }),
};

async function exhaust(
  app: ReturnType<typeof createTestApp>["app"],
  route: keyof typeof requests,
  ip: string,
) {
  for (let i = 0; i < OAUTH_RATE_LIMITS[route].limit; i++) {
    const res = await app.fetch(requests[route](ip));
    expect(res.status).not.toBe(429);
  }
}

describe("OAuth rate limiting", () => {
  it("keeps the limits in one place", () => {
    expect(OAUTH_RATE_LIMITS).toEqual({
      login: { limit: 10, windowMs: 60_000 },
      register: { limit: 10, windowMs: 3_600_000 },
      token: { limit: 60, windowMs: 60_000 },
    });
  });

  it.each(["register", "token"] as const)(
    "answers /%s over the limit with an OAuth-style 429",
    async (route) => {
      const { app } = createTestApp({
        oauthOptions: { clock: manualClock() },
      });
      await exhaust(app, route, "203.0.113.7");

      const res = await app.fetch(requests[route]("203.0.113.7"));

      expect(res.status).toBe(429);
      expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
      expect(await res.json()).toEqual({
        error: "temporarily_unavailable",
        error_description: expect.any(String),
      });
    },
  );

  it("answers /login over the limit with an error page", async () => {
    const { app } = createTestApp({ oauthOptions: { clock: manualClock() } });
    await exhaust(app, "login", "203.0.113.7");

    const res = await app.fetch(requests.login("203.0.113.7"));

    expect(res.status).toBe(429);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(await res.text()).toContain("Too many sign-in attempts");
  });

  it("limits each client IP separately", async () => {
    const { app } = createTestApp({ oauthOptions: { clock: manualClock() } });
    await exhaust(app, "login", "203.0.113.7");

    const res = await app.fetch(requests.login("198.51.100.9"));

    expect(res.status).not.toBe(429);
  });

  it("lets the client back in after the window", async () => {
    const clock = manualClock();
    const { app } = createTestApp({ oauthOptions: { clock } });
    await exhaust(app, "login", "203.0.113.7");

    clock.advance(OAUTH_RATE_LIMITS.login.windowMs);

    expect((await app.fetch(requests.login("203.0.113.7"))).status).not.toBe(
      429,
    );
  });

  it("accepts overridden limits", async () => {
    const { app } = createTestApp({
      oauthOptions: {
        clock: manualClock(),
        limits: { token: { limit: 1, windowMs: 1000 } },
      },
    });
    await app.fetch(requests.token("203.0.113.7"));

    expect((await app.fetch(requests.token("203.0.113.7"))).status).toBe(429);
  });
});
