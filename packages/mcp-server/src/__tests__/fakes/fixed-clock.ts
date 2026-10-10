import type { Clock } from "../../usecases/types";

export function fixedClock(iso = "2026-01-01T00:00:00.000Z"): Clock {
  return { now: () => new Date(iso) };
}
