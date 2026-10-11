/**
 * Region notes: per-item guidance that depends on where the user lives.
 *
 * Notes are layered as overlays. A region-wide overlay (`state: null`)
 * applies to every state in its FEMA region; a state overlay applies on top
 * of it and wins on conflict. The checklist seed applies the Region 9 /
 * Arizona overlay (originally written for Mesa, AZ) so the mobile app keeps
 * its current notes until it opts in to region selection.
 */

import type { PrepItem } from "../types";
import type { FemaRegionId, StateCode } from "./fema-regions";

export interface RegionNoteOverlay {
  id: string;
  region: FemaRegionId;
  /** null for a region-wide overlay. */
  state: StateCode | null;
  /** The place the notes were written for, if narrower than the state. */
  place: string | null;
  /** Item id → note. */
  notes: Readonly<Record<string, string>>;
}

/** The original Mesa, AZ notes, kept as the Region 9 / Arizona overlay. */
export const MESA_AZ_OVERLAY: RegionNoteOverlay = {
  id: "region-9-az-mesa",
  region: 9,
  state: "AZ",
  place: "Mesa, AZ",
  notes: {
    "water-1":
      "Desert climate demands extra water — FEMA recommends 1 gallon/day but consider 1.5 in Mesa summers",
    "water-2":
      "Monsoon flooding can contaminate municipal water; tablets are backup purification",
    "water-4":
      "Critical for extreme heat — Mesa averages 47 days/year over 109.5°F by 2050",
    "food-1":
      "Store in coolest spot possible — Arizona garage temps can exceed 130°F and degrade shelf life",
    "food-3":
      "Choose bars that won't melt — avoid chocolate-heavy options in AZ heat",
    "medical-2":
      "Heat can degrade medications — rotate frequently and store with cold packs if needed",
    "medical-3":
      "Mesa UV index regularly hits extreme (11+) — sunburn is a real emergency risk",
    "medical-4": "Mosquitoes spike during monsoon season (June–September)",
    "medical-5":
      "Essential for heat exhaustion first response — activate and apply to neck/armpits",
    "medical-6":
      "Soak and wear around neck — can drop body temp 20-30°F in extreme heat",
    "medical-7":
      "Wildfire risk is significant — 48% of Mesa buildings face some wildfire exposure",
    "shelter-1":
      "Doubles as flash flood water diverter and shade structure in desert sun",
    "shelter-2":
      "Reflects heat away when used as shade — not just for cold weather",
    "shelter-3":
      "Critical for dust storms (haboobs) and wildfire smoke — Mesa gets both regularly",
    "shelter-4":
      "Wet bandana on neck for cooling; dry over face during dust storms",
    "shelter-5":
      "Monsoon storms dump heavy rain fast — flash flood risk is real in Maricopa County",
    "shelter-6":
      "Seal window gaps during dust storms to keep fine particulates out",
    "tools-2":
      "Heat degrades batteries faster — check and rotate every 6 months in AZ",
    "tools-3":
      "Power outages spike during peak heat when the grid is strained — keep phones charged",
    "tools-5": "Backup power when battery bank dies during extended outage",
    "comms-1":
      "NOAA broadcasts dust storm and flash flood warnings — critical when cell towers are down",
    "comms-3":
      "Mark evacuation routes and cooling centers — Mesa has designated heat relief stations",
    "comms-4": "Protects phone during monsoon flash flooding",
    "documents-2":
      "Flash floods can soak through standard containers — use a sealed dry bag",
    "documents-3": "ATMs and card readers go down during power outages",
    "documents-4":
      "Include Mesa-specific shelters, cooling centers, and FEMA Region 9 contact info",
    "morale-1":
      "The namesake — compact, shelf-stable, and a morale booster when things get tough",
    "morale-5": "Choose heat-resistant candy — chocolate melts fast in Arizona",
  },
};

export const REGION_NOTE_OVERLAYS: readonly RegionNoteOverlay[] = [
  MESA_AZ_OVERLAY,
];

/**
 * The merged item notes for a region, and optionally a state within it.
 * Region-wide overlays apply first; state overlays override them.
 */
export function regionNotesFor(
  region: FemaRegionId,
  state?: StateCode,
): Record<string, string> {
  const matching = REGION_NOTE_OVERLAYS.filter(
    (o) => o.region === region && (o.state === null || o.state === state),
  ).sort((a, b) => Number(a.state !== null) - Number(b.state !== null));
  return Object.assign({}, ...matching.map((o) => o.notes)) as Record<
    string,
    string
  >;
}

/** Items with `regionNote` set from `notes`, or null where there is none. */
export function applyRegionNotes(
  items: readonly PrepItem[],
  notes: Readonly<Record<string, string>>,
): PrepItem[] {
  return items.map((item) => ({ ...item, regionNote: notes[item.id] ?? null }));
}
