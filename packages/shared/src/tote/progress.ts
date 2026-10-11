import type { ResolvedItem } from "../catalog/resolve-kit";
import type { ChecklistEntry, ItemStatus } from "../checklist/ports";
import type {
  Hazard,
  HazardEntry,
  HazardRelevance,
} from "../data/fema-regions";

/** How much an essential item counts toward readiness, against 1 for the rest. */
export const ESSENTIAL_WEIGHT = 2;

/** Items expiring within this many days (or already expired) are flagged. */
export const EXPIRY_WINDOW_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A kit item with the user's stored state for it, if any. */
export interface ToteLine {
  item: ResolvedItem;
  entry?: ChecklistEntry;
}

export function statusOf(line: ToteLine): ItemStatus {
  return line.entry?.status ?? "needed";
}

/**
 * How much of an item is in the tote, from 0 to 1. Only packed items count.
 * A packed item with no recorded quantity counts as fully packed; otherwise
 * it is `quantity / units`, capped at 1.
 */
export function packedFraction(line: ToteLine): number {
  if (statusOf(line) !== "packed") return 0;
  const quantity = line.entry?.quantity ?? line.item.units;
  return Math.min(1, quantity / line.item.units);
}

/**
 * Readiness of a kit, a whole number from 0 to 100:
 *
 *   floor(100 × Σ wᵢ·pᵢ / Σ wᵢ)
 *
 * over every item i in the kit, where wᵢ is `ESSENTIAL_WEIGHT` (2) for an
 * essential item and 1 otherwise, and pᵢ is `packedFraction`. Bought but
 * unpacked items count 0: the tote is what's ready. Rounded down, so 100
 * means every item is fully packed. An empty kit is 0.
 */
export function readinessPercent(lines: readonly ToteLine[]): number {
  let weighted = 0;
  let total = 0;
  for (const line of lines) {
    const weight = line.item.essential ? ESSENTIAL_WEIGHT : 1;
    total += weight;
    weighted += weight * packedFraction(line);
  }
  if (total === 0) return 0;
  // Nudge past float error so 2/3 + 1/3 of the weight still reaches 100.
  return Math.floor((100 * weighted) / total + 1e-9);
}

export type StatusCounts = Record<ItemStatus, number> & { total: number };

export function statusCounts(lines: readonly ToteLine[]): StatusCounts {
  const counts: StatusCounts = { needed: 0, bought: 0, packed: 0, total: 0 };
  for (const line of lines) {
    counts[statusOf(line)] += 1;
    counts.total += 1;
  }
  return counts;
}

/** `YYYY-MM-DD` for `months` after `date` (UTC), clamped to the month's last day. */
export function addMonths(date: Date, months: number): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

export interface Expiry {
  /** `YYYY-MM-DD`. */
  expiresOn: string;
  /** True when worked out from `packedAt` and the item's shelf life rather than the label. */
  estimated: boolean;
}

/**
 * When an item the user has (bought or packed) expires: the label date if
 * recorded, else `packedAt` plus the item's shelf life. Null when neither is
 * known or the item is still needed.
 */
export function expiryOf(line: ToteLine): Expiry | null {
  const { entry, item } = line;
  if (!entry || entry.status === "needed") return null;
  if (entry.expiresOn) return { expiresOn: entry.expiresOn, estimated: false };
  if (entry.packedAt && item.shelfLifeMonths !== null) {
    return {
      expiresOn: addMonths(entry.packedAt, item.shelfLifeMonths),
      estimated: true,
    };
  }
  return null;
}

export interface ExpiringItem extends Expiry {
  item: ResolvedItem;
  /** Whole days from `today` (UTC) to expiry; negative once expired. */
  daysLeft: number;
}

/** Items expiring within `windowDays` of `today`, or already expired, soonest first. */
export function expiringSoon(
  lines: readonly ToteLine[],
  today: Date,
  windowDays = EXPIRY_WINDOW_DAYS,
): ExpiringItem[] {
  const todayMs = Date.parse(today.toISOString().slice(0, 10));
  const result: ExpiringItem[] = [];
  for (const line of lines) {
    const expiry = expiryOf(line);
    if (!expiry) continue;
    const daysLeft = Math.round(
      (Date.parse(expiry.expiresOn) - todayMs) / DAY_MS,
    );
    if (daysLeft <= windowDays) {
      result.push({ ...expiry, item: line.item, daysLeft });
    }
  }
  return result.sort(
    (a, b) => a.daysLeft - b.daysLeft || a.item.id.localeCompare(b.item.id),
  );
}

export interface HazardCoverage {
  hazard: Hazard;
  relevance: HazardRelevance;
  /**
   * `"items"`: the kit has items for this hazard, and it is covered when all
   * of them are fully packed. `"essentials"`: no item targets it, so the base
   * kit stands in, and it is covered when every essential base item is
   * fully packed.
   */
  via: "items" | "essentials";
  covered: boolean;
  /** Ids of this hazard's items not yet fully packed; empty for `"essentials"`. */
  missing: string[];
}

/** Whether the packed kit covers each of the region's hazards, in region order. */
export function hazardCoverage(
  hazards: readonly HazardEntry[],
  lines: readonly ToteLine[],
): HazardCoverage[] {
  const fullyPacked = (line: ToteLine) => packedFraction(line) === 1;
  const essentialsPacked = lines
    .filter((l) => l.item.relevance === "base" && l.item.essential)
    .every(fullyPacked);

  return hazards.map(({ hazard, relevance }) => {
    const forHazard = lines.filter((l) => l.item.hazards.includes(hazard));
    if (forHazard.length === 0) {
      return {
        hazard,
        relevance,
        via: "essentials",
        covered: essentialsPacked,
        missing: [],
      };
    }
    const missing = forHazard
      .filter((l) => !fullyPacked(l))
      .map((l) => l.item.id);
    return {
      hazard,
      relevance,
      via: "items",
      covered: missing.length === 0,
      missing,
    };
  });
}
