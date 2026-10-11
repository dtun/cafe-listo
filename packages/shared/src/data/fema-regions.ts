/**
 * FEMA regions, the states and territories in each, and a hazard profile per
 * region.
 *
 * Data source: docs/research/fema-preparedness.md (sections 1 and 2). Every
 * hazard entry cites ids from `sources.ts`.
 *
 * How the hazard profile is built:
 *
 * - The ranking is derived from NRI v1.20 expected annual loss (EAL), summed
 *   across each region's states and territories [fema-nri-data].
 * - `primary`: the hazard is at least 10% of the region's total EAL.
 * - `secondary`: the hazard is in the region's top five by EAL, or a Ready.gov
 *   hazard page names the region's states or coasts as higher risk.
 * - `winter-weather` covers NRI cold wave, ice storm and winter weather. The
 *   research doc notes that NRI winter weather alone is small everywhere, and
 *   that winter-kit guidance should key on cold wave and ice storm as well.
 * - Hazards with no Ready.gov page in `sources.ts` (drought, hail, strong wind,
 *   lightning, landslide, avalanche) are left out. Coastal flooding folds into
 *   `flood`.
 * - EAL measures dollars, not frequency. Wildfire, tornado and winter weather
 *   rank lower by loss than the Ready.gov pages suggest; see the
 *   "Disagreement" notes in the research doc.
 * - The Marshall Islands and Micronesia are in Region 9 but have no NRI rows,
 *   so Region 9's ranking excludes them.
 */

import { getSource, type SourceId } from "./sources";

export const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;

/**
 * DC, the territories and the freely associated states that FEMA assigns to a
 * region. MH (Marshall Islands) and FM (Micronesia) are in Region 9 but are
 * missing from the NRI.
 */
export const US_DISTRICTS_AND_TERRITORIES = [
  "DC",
  "PR",
  "VI",
  "GU",
  "AS",
  "MP",
  "MH",
  "FM",
] as const;

export const STATE_CODES = [
  ...US_STATES,
  ...US_DISTRICTS_AND_TERRITORIES,
] as const;

/** USPS two-letter code for a state, DC, territory or freely associated state. */
export type StateCode = (typeof STATE_CODES)[number];

export type FemaRegionId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type Hazard =
  | "flood"
  | "hurricane"
  | "earthquake"
  | "wildfire"
  | "tornado"
  | "heat"
  | "winter-weather"
  | "volcano"
  | "tsunami";

export type HazardRelevance = "primary" | "secondary";

export interface HazardEntry {
  hazard: Hazard;
  relevance: HazardRelevance;
  /** At least one source id backs every hazard claim. */
  sources: readonly [SourceId, ...SourceId[]];
}

export interface FemaRegion {
  id: FemaRegionId;
  name: string;
  /** City of the regional office, as named on the region page. */
  office: string;
  /** The region's FEMA page, which is its official contact point. */
  contactUrl: string;
  /** Source id for the region page. */
  source: SourceId;
  states: readonly StateCode[];
  hazards: readonly HazardEntry[];
}

/** The Ready.gov page for each hazard. */
export const HAZARD_SOURCES: Record<Hazard, SourceId> = {
  flood: "ready-floods",
  hurricane: "ready-hurricanes",
  earthquake: "ready-earthquakes",
  wildfire: "ready-wildfires",
  tornado: "ready-tornadoes",
  heat: "ready-heat",
  "winter-weather": "ready-winter-weather",
  volcano: "ready-volcanoes",
  tsunami: "ready-tsunamis",
};

/** A hazard ranked by NRI expected annual loss. */
function byLoss(hazard: Hazard, relevance: HazardRelevance): HazardEntry {
  return {
    hazard,
    relevance,
    sources: ["fema-nri-data", HAZARD_SOURCES[hazard]],
  };
}

/** A hazard the Ready.gov page (or region page) names for this region. */
function byGuidance(
  hazard: Hazard,
  relevance: HazardRelevance,
  ...extra: SourceId[]
): HazardEntry {
  return { hazard, relevance, sources: [HAZARD_SOURCES[hazard], ...extra] };
}

interface RegionInput {
  id: FemaRegionId;
  source: SourceId;
  office: string;
  states: readonly StateCode[];
  hazards: readonly HazardEntry[];
}

function region(input: RegionInput): FemaRegion {
  return {
    ...input,
    name: `FEMA Region ${input.id}`,
    contactUrl: getSource(input.source).url,
  };
}

export const FEMA_REGIONS: readonly FemaRegion[] = [
  region({
    id: 1,
    source: "fema-region-1",
    office: "Cambridge, MA",
    states: ["CT", "ME", "MA", "NH", "RI", "VT"],
    hazards: [
      byLoss("flood", "primary"),
      byLoss("hurricane", "primary"),
      byLoss("earthquake", "secondary"),
      byLoss("winter-weather", "secondary"),
    ],
  }),
  region({
    id: 2,
    source: "fema-region-2",
    office: "New York, NY",
    states: ["NJ", "NY", "PR", "VI"],
    hazards: [
      byLoss("flood", "primary"),
      byLoss("hurricane", "primary"),
      byLoss("earthquake", "primary"),
      byLoss("winter-weather", "secondary"),
      byLoss("tsunami", "secondary"),
    ],
  }),
  region({
    id: 3,
    source: "fema-region-3",
    office: "Philadelphia, PA",
    states: ["DE", "DC", "MD", "PA", "VA", "WV"],
    hazards: [
      {
        ...byLoss("flood", "primary"),
        sources: ["fema-nri-data", "ready-floods", "fema-region-3"],
      },
      byLoss("heat", "secondary"),
      byLoss("hurricane", "secondary"),
      byLoss("winter-weather", "secondary"),
      byLoss("earthquake", "secondary"),
    ],
  }),
  region({
    id: 4,
    source: "fema-region-4",
    office: "Atlanta, GA",
    states: ["AL", "FL", "GA", "KY", "MS", "NC", "SC", "TN"],
    hazards: [
      byLoss("flood", "primary"),
      byLoss("hurricane", "primary"),
      byLoss("tornado", "primary"),
      byLoss("earthquake", "secondary"),
      byLoss("winter-weather", "secondary"),
    ],
  }),
  region({
    id: 5,
    source: "fema-region-5",
    office: "Chicago, IL",
    states: ["IL", "IN", "MI", "MN", "OH", "WI"],
    hazards: [
      byLoss("flood", "primary"),
      byLoss("winter-weather", "primary"),
      byLoss("tornado", "primary"),
      byLoss("heat", "secondary"),
    ],
  }),
  region({
    id: 6,
    source: "fema-region-6",
    office: "Denton, TX",
    states: ["AR", "LA", "NM", "OK", "TX"],
    hazards: [
      byLoss("flood", "primary"),
      byLoss("tornado", "primary"),
      byLoss("hurricane", "primary"),
      byLoss("winter-weather", "secondary"),
      byLoss("heat", "secondary"),
    ],
  }),
  region({
    id: 7,
    source: "fema-region-7",
    office: "Kansas City, MO",
    states: ["IA", "KS", "MO", "NE"],
    hazards: [
      byLoss("flood", "primary"),
      byLoss("tornado", "primary"),
      byLoss("heat", "primary"),
      byLoss("winter-weather", "secondary"),
    ],
  }),
  region({
    id: 8,
    source: "fema-region-8",
    office: "Denver, CO",
    states: ["CO", "MT", "ND", "SD", "UT", "WY"],
    hazards: [
      byLoss("flood", "primary"),
      byLoss("earthquake", "primary"),
      byLoss("winter-weather", "primary"),
      byLoss("wildfire", "secondary"),
    ],
  }),
  region({
    id: 9,
    source: "fema-region-9",
    office: "Oakland, CA",
    states: ["AZ", "CA", "HI", "NV", "GU", "AS", "MP", "MH", "FM"],
    hazards: [
      byLoss("earthquake", "primary"),
      byLoss("flood", "primary"),
      {
        ...byLoss("wildfire", "secondary"),
        sources: ["fema-nri-data", "ready-wildfires", "fema-region-9"],
      },
      byLoss("heat", "secondary"),
      byGuidance("hurricane", "secondary", "fema-region-9"),
      byGuidance("volcano", "secondary"),
      byGuidance("tsunami", "secondary"),
    ],
  }),
  region({
    id: 10,
    source: "fema-region-10",
    office: "Bothell, WA",
    states: ["AK", "ID", "OR", "WA"],
    hazards: [
      byLoss("earthquake", "primary"),
      byLoss("flood", "primary"),
      byLoss("wildfire", "secondary"),
      byLoss("tsunami", "secondary"),
      byLoss("winter-weather", "secondary"),
      byGuidance("volcano", "secondary"),
    ],
  }),
];

const REGION_BY_STATE = new Map<string, FemaRegion>(
  FEMA_REGIONS.flatMap((r) => r.states.map((s) => [s, r] as const)),
);

export function isStateCode(code: string): code is StateCode {
  return REGION_BY_STATE.has(code);
}

export function getRegion(id: FemaRegionId): FemaRegion {
  const found = FEMA_REGIONS.find((r) => r.id === id);
  if (!found) {
    throw new Error(`Unknown FEMA region: ${id}`);
  }
  return found;
}

/**
 * The FEMA region for a USPS state or territory code (case-insensitive), or
 * undefined if the code is not one FEMA assigns to a region.
 */
export function regionForState(code: string): FemaRegion | undefined {
  return REGION_BY_STATE.get(code.trim().toUpperCase());
}
