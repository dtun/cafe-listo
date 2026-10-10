import type { Clock } from "../../usecases/types";

export function fixedClock(iso = "2026-10-10T08:07:00.000Z"): Clock {
  return { now: () => new Date(iso) };
}
