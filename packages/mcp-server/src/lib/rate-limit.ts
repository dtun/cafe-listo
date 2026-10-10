import type { Clock } from "../usecases/types";

export interface RateLimit {
  limit: number;
  windowMs: number;
}

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** Default cap on tracked keys per limiter; beyond it the oldest windows are evicted. */
export const DEFAULT_MAX_KEYS = 10_000;

/**
 * In-memory fixed-window counter per key. Single-process only: counts reset
 * on restart and are not shared between replicas, which is enough to stop one
 * client from exhausting Supabase Auth's per-IP limits for everyone.
 *
 * Memory is bounded: expired windows are swept, and once maxKeys keys are
 * tracked the oldest windows are evicted to make room. The map is kept in
 * window-start order (a renewed window is re-inserted), so its first entries
 * are always the oldest.
 */
export class FixedWindowRateLimiter {
  private windows = new Map<string, { start: number; count: number }>();
  private nextSweep = 0;

  constructor(
    private readonly rule: RateLimit,
    private readonly clock: Clock,
    private readonly maxKeys: number = DEFAULT_MAX_KEYS,
  ) {}

  /** Number of keys currently tracked. */
  get size(): number {
    return this.windows.size;
  }

  hit(key: string): RateLimitDecision {
    const now = this.clock.now().getTime();
    if (now >= this.nextSweep) this.sweep(now);

    const current = this.windows.get(key);
    if (!current || now - current.start >= this.rule.windowMs) {
      this.windows.delete(key);
      this.makeRoom(now);
      this.windows.set(key, { start: now, count: 1 });
      return { allowed: true };
    }
    if (current.count < this.rule.limit) {
      current.count += 1;
      return { allowed: true };
    }
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(
        (current.start + this.rule.windowMs - now) / 1000,
      ),
    };
  }

  /** Before adding a key at the cap: sweep now, then evict the oldest windows if still full. */
  private makeRoom(now: number): void {
    if (this.windows.size < this.maxKeys) return;
    this.sweep(now);
    for (const key of this.windows.keys()) {
      if (this.windows.size < this.maxKeys) break;
      this.windows.delete(key);
    }
  }

  /** Drops expired windows; runs at least once per window length. */
  private sweep(now: number): void {
    for (const [key, window] of this.windows) {
      // Window-start order: once one window is live, the rest are too.
      if (now - window.start < this.rule.windowMs) break;
      this.windows.delete(key);
    }
    this.nextSweep = now + this.rule.windowMs;
  }
}

/**
 * The client IP as seen by the hosting edge proxy. Railway's edge sets
 * X-Real-IP and appends the real IP to X-Forwarded-For, keeping whatever the
 * client sent in front of it. So: X-Real-IP, then the LAST X-Forwarded-For
 * entry, then the socket's remote address. Never the first entry, which the
 * client controls.
 */
export function clientIp(req: Request, remoteAddress?: string): string {
  const realIp = req.headers.get("X-Real-IP")?.trim();
  const forwarded = req.headers
    .get("X-Forwarded-For")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .at(-1);
  return realIp || forwarded || remoteAddress || "unknown";
}
