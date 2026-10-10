import { describe, expect, it } from "vitest";
import {
  clientIp,
  DEFAULT_MAX_KEYS,
  FixedWindowRateLimiter,
} from "../rate-limit";

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

describe("FixedWindowRateLimiter memory", () => {
  it("sweeps expired windows", () => {
    const clock = manualClock();
    const limiter = new FixedWindowRateLimiter(
      { limit: 1, windowMs: 60_000 },
      clock,
    );
    for (let i = 0; i < 100; i++) limiter.hit(`ip-${i}`);
    expect(limiter.size).toBe(100);

    clock.advance(60_000);
    limiter.hit("fresh");

    expect(limiter.size).toBe(1);
  });

  it("never tracks more than maxKeys, evicting the oldest windows", () => {
    const clock = manualClock();
    const limiter = new FixedWindowRateLimiter(
      { limit: 1, windowMs: 60 * 60_000 },
      clock,
      3,
    );
    for (const key of ["a", "b", "c", "d", "e"]) {
      limiter.hit(key);
      clock.advance(1000);
    }

    expect(limiter.size).toBe(3);
    // The newest keys are still limited; the oldest were evicted.
    expect(limiter.hit("e").allowed).toBe(false);
    expect(limiter.hit("d").allowed).toBe(false);
    expect(limiter.hit("a").allowed).toBe(true);
  });

  it("evicts in window-start order after a window renews", () => {
    const clock = manualClock();
    const limiter = new FixedWindowRateLimiter(
      { limit: 1, windowMs: 10_000 },
      clock,
      2,
    );
    limiter.hit("a");
    clock.advance(5_000);
    limiter.hit("b");
    clock.advance(5_000);
    limiter.hit("a"); // renews: a is now the newest window
    clock.advance(1_000);

    limiter.hit("c"); // at the cap: b is the oldest and is evicted

    expect(limiter.size).toBe(2);
    expect(limiter.hit("a").allowed).toBe(false);
    expect(limiter.hit("c").allowed).toBe(false);
  });

  it("caps at 10k keys by default", () => {
    const limiter = new FixedWindowRateLimiter(
      { limit: 1, windowMs: 60 * 60_000 },
      manualClock(),
    );
    for (let i = 0; i < DEFAULT_MAX_KEYS + 500; i++) limiter.hit(`ip-${i}`);

    expect(DEFAULT_MAX_KEYS).toBe(10_000);
    expect(limiter.size).toBe(DEFAULT_MAX_KEYS);
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
