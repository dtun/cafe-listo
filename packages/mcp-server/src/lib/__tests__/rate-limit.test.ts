import { describe, expect, it } from "vitest";
import { clientIp, FixedWindowRateLimiter } from "../rate-limit";

function manualClock(start = 0) {
  let now = start;
  return {
    now: () => new Date(now),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("FixedWindowRateLimiter", () => {
  it("allows up to the limit per window, then reports when to retry", () => {
    const clock = manualClock();
    const limiter = new FixedWindowRateLimiter(
      { limit: 2, windowMs: 60_000 },
      clock,
    );

    expect(limiter.hit("a")).toEqual({ allowed: true });
    expect(limiter.hit("a")).toEqual({ allowed: true });
    clock.advance(15_000);
    expect(limiter.hit("a")).toEqual({
      allowed: false,
      retryAfterSeconds: 45,
    });
  });

  it("counts keys independently", () => {
    const limiter = new FixedWindowRateLimiter(
      { limit: 1, windowMs: 60_000 },
      manualClock(),
    );

    expect(limiter.hit("a").allowed).toBe(true);
    expect(limiter.hit("b").allowed).toBe(true);
    expect(limiter.hit("a").allowed).toBe(false);
  });

  it("starts a fresh window once the old one ends", () => {
    const clock = manualClock();
    const limiter = new FixedWindowRateLimiter(
      { limit: 1, windowMs: 60_000 },
      clock,
    );
    limiter.hit("a");
    expect(limiter.hit("a").allowed).toBe(false);

    clock.advance(60_000);

    expect(limiter.hit("a").allowed).toBe(true);
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) =>
    new Request("http://localhost/", { headers });

  it("prefers X-Real-IP, which the edge proxy sets", () => {
    expect(
      clientIp(
        req({ "X-Real-IP": "203.0.113.7", "X-Forwarded-For": "1.2.3.4" }),
        "10.0.0.2",
      ),
    ).toBe("203.0.113.7");
  });

  it("otherwise uses the last X-Forwarded-For entry (appended by the edge)", () => {
    expect(
      clientIp(req({ "X-Forwarded-For": "1.2.3.4, 203.0.113.7" }), "10.0.0.2"),
    ).toBe("203.0.113.7");
  });

  it("ignores a client-spoofed first X-Forwarded-For entry", () => {
    const spoofed = ["1.1.1.1", "2.2.2.2", "3.3.3.3"].map((fake) =>
      clientIp(req({ "X-Forwarded-For": `${fake}, 203.0.113.7` })),
    );

    expect(new Set(spoofed)).toEqual(new Set(["203.0.113.7"]));
  });

  it("falls back to the remote address", () => {
    expect(clientIp(req({}), "10.0.0.2")).toBe("10.0.0.2");
    expect(clientIp(req({ "X-Forwarded-For": " , " }), "10.0.0.2")).toBe(
      "10.0.0.2",
    );
  });
});
