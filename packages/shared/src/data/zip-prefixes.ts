/**
 * ZIP code → state lookup through the first three digits (the USPS sectional
 * center prefix), plus a few five-digit exceptions for Pacific territories
 * that share a prefix.
 *
 * This is approximate. A few ZIP codes near state borders are served from a
 * sectional center in a neighboring state, so the result can be the wrong
 * state (and so the wrong FEMA region) for those addresses. Military (AA, AE,
 * AP) and unassigned prefixes return undefined.
 */

import {
  type FemaRegion,
  type StateCode,
  regionForState,
} from "./fema-regions";

/** Inclusive ranges of three-digit prefixes: [first, last, state]. */
const PREFIX_RANGES: readonly (readonly [number, number, StateCode])[] = [
  [5, 5, "NY"],
  [6, 7, "PR"],
  [8, 8, "VI"],
  [9, 9, "PR"],
  [10, 27, "MA"],
  [28, 29, "RI"],
  [30, 38, "NH"],
  [39, 49, "ME"],
  [50, 54, "VT"],
  [55, 55, "MA"],
  [56, 59, "VT"],
  [60, 69, "CT"],
  [70, 89, "NJ"],
  [100, 149, "NY"],
  [150, 196, "PA"],
  [197, 199, "DE"],
  [200, 200, "DC"],
  [201, 201, "VA"],
  [202, 205, "DC"],
  [206, 219, "MD"],
  [220, 246, "VA"],
  [247, 268, "WV"],
  [270, 289, "NC"],
  [290, 299, "SC"],
  [300, 319, "GA"],
  [320, 339, "FL"],
  [341, 349, "FL"],
  [350, 369, "AL"],
  [370, 385, "TN"],
  [386, 397, "MS"],
  [398, 399, "GA"],
  [400, 427, "KY"],
  [430, 459, "OH"],
  [460, 479, "IN"],
  [480, 499, "MI"],
  [500, 528, "IA"],
  [530, 549, "WI"],
  [550, 567, "MN"],
  [569, 569, "DC"],
  [570, 577, "SD"],
  [580, 588, "ND"],
  [590, 599, "MT"],
  [600, 629, "IL"],
  [630, 658, "MO"],
  [660, 679, "KS"],
  [680, 693, "NE"],
  [700, 714, "LA"],
  [716, 729, "AR"],
  [730, 732, "OK"],
  [733, 733, "TX"],
  [734, 749, "OK"],
  [750, 799, "TX"],
  [800, 816, "CO"],
  [820, 831, "WY"],
  [832, 838, "ID"],
  [840, 847, "UT"],
  [850, 865, "AZ"],
  [870, 884, "NM"],
  [885, 885, "TX"],
  [889, 898, "NV"],
  [900, 961, "CA"],
  [967, 968, "HI"],
  [969, 969, "GU"],
  [970, 979, "OR"],
  [980, 994, "WA"],
  [995, 999, "AK"],
];

/**
 * Five-digit ZIPs that differ from their prefix's state. 967 is Hawaii except
 * American Samoa; 969 is Guam except the Northern Mariana Islands, the
 * Marshall Islands and Micronesia. Palau (96939, 96940) is not in a FEMA
 * region and returns undefined.
 */
const ZIP_EXCEPTIONS: Readonly<Record<string, StateCode | null>> = {
  "96799": "AS",
  "96939": null,
  "96940": null,
  "96941": "FM",
  "96942": "FM",
  "96943": "FM",
  "96944": "FM",
  "96950": "MP",
  "96951": "MP",
  "96952": "MP",
  "96960": "MH",
  "96970": "MH",
};

const ZIP_PATTERN = /^(\d{5})(?:-?\d{4})?$/;

/**
 * The state for a five-digit (or ZIP+4) code, or undefined if the ZIP is
 * malformed, military or unassigned. Approximate at state borders.
 */
export function stateForZip(zip: string): StateCode | undefined {
  const match = ZIP_PATTERN.exec(zip.trim());
  if (!match) {
    return undefined;
  }
  const five = match[1];
  if (five in ZIP_EXCEPTIONS) {
    return ZIP_EXCEPTIONS[five] ?? undefined;
  }
  const prefix = Number(five.slice(0, 3));
  const range = PREFIX_RANGES.find(([lo, hi]) => prefix >= lo && prefix <= hi);
  return range?.[2];
}

/**
 * The FEMA region for a ZIP code, through the ZIP's state. Approximate at
 * state borders; see `stateForZip`.
 */
export function regionForZip(zip: string): FemaRegion | undefined {
  const state = stateForZip(zip);
  return state ? regionForState(state) : undefined;
}
