import type { Container } from "./container";

/**
 * One line of a kit to pack: `quantity` identical units of an item.
 *
 * Volumes and weights are per unit and approximate.
 */
export interface PackItem {
  id: string;
  /** Whole number of units, 0 or more. */
  quantity: number;
  /** Approximate volume of one unit (L). */
  unitVolumeL: number;
  /** Approximate weight of one unit (kg). */
  unitWeightKg: number;
  /**
   * False for things that belong beside the tote rather than in it (bulk
   * water beyond a target, pet food bags). These always go to `overflow`.
   */
  packable: boolean;
  /** Essentials are packed before everything else. Defaults to false. */
  essential?: boolean;
  /**
   * How relevant the item is to the hazards the household faces. Higher
   * packs first among items with the same `essential` value. Any finite
   * number works; a 0–1 scale is suggested. Defaults to 0.
   */
  hazardRelevance?: number;
}

/** Units of an item that went into the tote. */
export interface PackedLine {
  id: string;
  quantity: number;
  volumeL: number;
  weightKg: number;
}

export type OverflowReason = "not-packable" | "no-space";

/** Units of an item that stay out of the tote. */
export interface OverflowLine {
  id: string;
  quantity: number;
  volumeL: number;
  weightKg: number;
  reason: OverflowReason;
  /** Why these units are out, in plain words. */
  message: string;
  /** What to do with them instead. */
  hint: string;
}

export type PackWarningCode = "approximate" | "overflow" | "overweight";

export interface PackWarning {
  code: PackWarningCode;
  message: string;
  /** Set when the warning is about a single item. */
  itemId?: string;
}

export interface PackResult {
  /** Packed units, in packing order. */
  fits: PackedLine[];
  /** Units left out, in packing order. */
  overflow: OverflowLine[];
  /** Packed volume as a percentage of the container's usable volume. */
  fillPercent: number;
  /** Total weight of the packed units (kg). */
  weightKg: number;
  /** Always includes an `approximate` warning first. */
  warnings: PackWarning[];
}

export const STORE_BESIDE_TOTE_HINT = "Store beside the tote.";

/** Slack for floating-point sums when checking remaining space. */
const EPSILON_L = 1e-9;

/**
 * Packs a kit into a container and reports what fits.
 *
 * Pure and deterministic: the same items and container always give the same
 * result, whatever order the items arrive in, and the inputs are not mutated.
 *
 * How it packs:
 * 1. Items with `quantity` 0 are ignored.
 * 2. Items are sorted by `essential` (true first), then `hazardRelevance`
 *    (highest first), then `id` (alphabetical) to break ties.
 * 3. `packable: false` items go straight to `overflow` with reason
 *    `not-packable` and take no space.
 * 4. Each packable item takes as many whole units as still fit in the
 *    container's `usableVolumeL`. If only some units fit (say 5 of 20 water
 *    jugs), those go to `fits` and the rest go to `overflow` with reason
 *    `no-space`, so one item can appear in both lists. Packing carries on
 *    with later items, so a small low-priority item can still fill a gap a
 *    bulky one could not.
 * 5. Only volume limits packing. Weight never keeps an item out; instead an
 *    `overweight` warning fires when the packed weight is above the
 *    container's `maxCarryWeightKg`.
 *
 * Volume is treated as a single number, ignoring shape, so a "fit" means
 * "probably fits". Every result says so in its `approximate` warning.
 *
 * @throws RangeError if a quantity is not a whole number 0 or more, or a
 *   volume, weight or hazard relevance is negative or not finite.
 */
export function packTote(
  items: readonly PackItem[],
  container: Container,
): PackResult {
  items.forEach(assertValidItem);

  const ordered = items
    .filter((item) => item.quantity > 0)
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compareItems(a.item, b.item) || a.index - b.index)
    .map(({ item }) => item);

  const fits: PackedLine[] = [];
  const overflow: OverflowLine[] = [];
  const itemWarnings: PackWarning[] = [];
  let usedVolumeL = 0;
  let packedWeightKg = 0;

  for (const item of ordered) {
    if (!item.packable) {
      overflow.push(
        overflowLine(
          item,
          item.quantity,
          "not-packable",
          `${item.id} is not meant to go in the tote.`,
        ),
      );
      continue;
    }

    const remainingL = container.usableVolumeL - usedVolumeL;
    const unitsThatFit =
      item.unitVolumeL === 0
        ? item.quantity
        : Math.min(
            item.quantity,
            Math.max(
              0,
              Math.floor((remainingL + EPSILON_L) / item.unitVolumeL),
            ),
          );

    if (unitsThatFit > 0) {
      const line = lineFor(item, unitsThatFit);
      fits.push(line);
      usedVolumeL += item.unitVolumeL * unitsThatFit;
      packedWeightKg += item.unitWeightKg * unitsThatFit;
    }

    const leftOver = item.quantity - unitsThatFit;
    if (leftOver > 0) {
      const message =
        unitsThatFit === 0
          ? `No room left for any of the ${item.quantity} units of ${item.id}.`
          : `Only ${unitsThatFit} of ${item.quantity} units of ${item.id} fit; ${leftOver} won't.`;
      const line = overflowLine(item, leftOver, "no-space", message);
      overflow.push(line);
      itemWarnings.push({
        code: "overflow",
        itemId: item.id,
        message: `${message} That's about ${formatNumber(line.volumeL)} L and ${formatNumber(line.weightKg)} kg to store beside the tote.`,
      });
    }
  }

  const weightKg = round(packedWeightKg, 2);
  const warnings: PackWarning[] = [
    {
      code: "approximate",
      message: `Volume and weight are approximate. Fill is based on about ${formatNumber(container.usableVolumeL)} L of usable space in the ${container.name}, ignoring item shapes, so check by packing for real.`,
    },
    ...itemWarnings,
  ];

  if (packedWeightKg > container.maxCarryWeightKg) {
    warnings.push({
      code: "overweight",
      message: `The packed tote weighs about ${formatNumber(weightKg)} kg, over the ${formatNumber(container.maxCarryWeightKg)} kg one person should carry. Split the load or plan a two-person lift.`,
    });
  }

  return {
    fits,
    overflow,
    fillPercent:
      container.usableVolumeL > 0
        ? round((usedVolumeL / container.usableVolumeL) * 100, 1)
        : 0,
    weightKg,
    warnings,
  };
}

function compareItems(a: PackItem, b: PackItem): number {
  const essential = Number(b.essential ?? false) - Number(a.essential ?? false);
  if (essential !== 0) return essential;
  const relevance = (b.hazardRelevance ?? 0) - (a.hazardRelevance ?? 0);
  if (relevance !== 0) return relevance;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function lineFor(item: PackItem, quantity: number): PackedLine {
  return {
    id: item.id,
    quantity,
    volumeL: round(item.unitVolumeL * quantity, 3),
    weightKg: round(item.unitWeightKg * quantity, 3),
  };
}

function overflowLine(
  item: PackItem,
  quantity: number,
  reason: OverflowReason,
  message: string,
): OverflowLine {
  return {
    ...lineFor(item, quantity),
    reason,
    message,
    hint: STORE_BESIDE_TOTE_HINT,
  };
}

function assertValidItem(item: PackItem): void {
  if (!Number.isInteger(item.quantity) || item.quantity < 0) {
    throw new RangeError(
      `${item.id}: quantity must be a whole number 0 or more, got ${item.quantity}`,
    );
  }
  const fields = [
    ["unitVolumeL", item.unitVolumeL],
    ["unitWeightKg", item.unitWeightKg],
    ["hazardRelevance", item.hazardRelevance ?? 0],
  ] as const;
  for (const [name, value] of fields) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(
        `${item.id}: ${name} must be a finite number 0 or more, got ${value}`,
      );
    }
  }
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatNumber(value: number): string {
  return String(round(value, 1));
}
