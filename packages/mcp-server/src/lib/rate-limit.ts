import type { Clock } from "../usecases/types";

export interface RateLimit {
  limit: number;
  windowMs: number;
}

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * In-memory fixed-window counter per key. Single-process only: counts reset
 * on restart and are not shared between replicas, which is enough to stop one
 * client from exhausting Supabase Auth's per-IP limits for everyone.
 */
export class FixedWindowRateLimiter {
  private windows = new Map<string, { start: number; count: number }>();
  private nextSweep = 0;

  constructor(
    private readonly rule: RateLimit,
    private readonly clock: Clock,
  ) {}

  hit(key: string): RateLimitDecision {
    const now = this.clock.now().getTime();
    this.sweep(now);

    const current = this.windows.get(key);
    if (!current || now - current.start >= this.rule.windowMs) {
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

  /** Drops expired windows at most once per window length so memory stays bounded. */
  private sweep(now: number): void {
    if (now < this.nextSweep) return;
    for (const [key, window] of this.windows) {
      if (now - window.start >= this.rule.windowMs) this.windows.delete(key);
    }
    this.nextSweep = now + this.rule.windowMs;
  }
}

/**
 * The client IP: the first X-Forwarded-For entry (set by the hosting proxy),
 * falling back to the socket's remote address.
 */
export function clientIp(req: Request, remoteAddress?: string): string {
  const forwarded = req.headers.get("X-Forwarded-For")?.split(",")[0].trim();
  return forwarded || remoteAddress || "unknown";
}
