/**
 * Public sources behind every preparedness number Cafe Listo quotes.
 * The research write-up lives in docs/research/fema-preparedness.md and
 * cites these entries by id. Ids are stable: downstream data (FEMA regions,
 * the item catalog) references them, so never rename or reuse one.
 */

export type SourcePublisher = "FEMA" | "Ready.gov (FEMA)" | "The Home Depot";

export interface Source {
  /** Stable, short, kebab-case identifier. */
  id: string;
  title: string;
  publisher: SourcePublisher;
  /** Canonical https URL. */
  url: string;
  /**
   * ISO date (YYYY-MM-DD) the page was last read for this research, or
   * null when the page could not be retrieved and its contents are unverified.
   */
  accessed: string | null;
  /** Caveats a reader needs before quoting this source. */
  note?: string;
}

const ACCESSED = "2026-10-11";

export const SOURCES = [
  // FEMA regions
  {
    id: "fema-regions",
    title: "Regions",
    publisher: "FEMA",
    url: "https://www.fema.gov/about/organization/regions",
    accessed: ACCESSED,
  },
  {
    id: "fema-region-1",
    title: "Region 1",
    publisher: "FEMA",
    url: "https://www.fema.gov/about/regions/region-1",
    accessed: ACCESSED,
  },
  {
    id: "fema-region-2",
    title: "Region 2",
    publisher: "FEMA",
    url: "https://www.fema.gov/about/regions/region-2",
    accessed: ACCESSED,
  },
  {
    id: "fema-region-3",
    title: "Region 3",
    publisher: "FEMA",
    url: "https://www.fema.gov/about/regions/region-3",
    accessed: ACCESSED,
  },
  {
    id: "fema-region-4",
    title: "Region 4",
    publisher: "FEMA",
    url: "https://www.fema.gov/about/regions/region-4",
    accessed: ACCESSED,
  },
  {
    id: "fema-region-5",
    title: "Region 5",
    publisher: "FEMA",
    url: "https://www.fema.gov/about/regions/region-5",
    accessed: ACCESSED,
  },
  {
    id: "fema-region-6",
    title: "Region 6",
    publisher: "FEMA",
    url: "https://www.fema.gov/about/regions/region-6",
    accessed: ACCESSED,
  },
  {
    id: "fema-region-7",
    title: "Region 7",
    publisher: "FEMA",
    url: "https://www.fema.gov/about/regions/region-7",
    accessed: ACCESSED,
  },
  {
    id: "fema-region-8",
    title: "Region 8",
    publisher: "FEMA",
    url: "https://www.fema.gov/about/regions/region-8",
    accessed: ACCESSED,
  },
  {
    id: "fema-region-9",
    title: "Region 9",
    publisher: "FEMA",
    url: "https://www.fema.gov/about/regions/region-9",
    accessed: ACCESSED,
  },
  {
    id: "fema-region-10",
    title: "Region 10",
    publisher: "FEMA",
    url: "https://www.fema.gov/about/regions/region-10",
    accessed: ACCESSED,
  },

  // National Risk Index
  {
    id: "fema-nri",
    title: "National Risk Index for Natural Hazards",
    publisher: "FEMA",
    url: "https://www.fema.gov/flood-maps/products-tools/national-risk-index",
    accessed: ACCESSED,
  },
  {
    id: "fema-nri-data",
    title: "National Risk Index Data (OpenFEMA, v1.20, December 2025)",
    publisher: "FEMA",
    url: "https://www.fema.gov/about/openfema/data-sets/national-risk-index-data",
    accessed: ACCESSED,
    note: "Region rankings in the research doc are aggregated from the All States and Territories table (NRI_Table_States.zip) linked from this page.",
  },

  // Kit and per-person guidance
  {
    id: "ready-kit",
    title: "Build A Kit",
    publisher: "Ready.gov (FEMA)",
    url: "https://www.ready.gov/kit",
    accessed: ACCESSED,
  },
  {
    id: "ready-water",
    title: "Water",
    publisher: "Ready.gov (FEMA)",
    url: "https://www.ready.gov/water",
    accessed: ACCESSED,
  },
  {
    id: "ready-food",
    title: "Food",
    publisher: "Ready.gov (FEMA)",
    url: "https://www.ready.gov/food",
    accessed: ACCESSED,
  },
  {
    id: "fema-food-water-2004",
    title: "Food and Water in an Emergency (FEMA 477)",
    publisher: "FEMA",
    url: "https://www.fema.gov/pdf/library/f&web.pdf",
    accessed: ACCESSED,
    note: "Dated August 2004, co-published with the American Red Cross. Older than the Ready.gov pages and disagrees with them on duration.",
  },
  {
    id: "fema-evac-sip-planning",
    title: "Planning Considerations: Evacuation and Shelter-in-Place",
    publisher: "FEMA",
    url: "https://www.fema.gov/sites/default/files/2020-07/planning-considerations-evacuation-and-shelter-in-place.pdf",
    accessed: ACCESSED,
    note: "Dated July 2019. Written for emergency managers, not households.",
  },

  // Specific needs
  {
    id: "ready-older-adults",
    title: "Older Adults",
    publisher: "Ready.gov (FEMA)",
    url: "https://www.ready.gov/older-adults",
    accessed: ACCESSED,
  },
  {
    id: "ready-disability",
    title: "People with Disabilities",
    publisher: "Ready.gov (FEMA)",
    url: "https://www.ready.gov/disability",
    accessed: ACCESSED,
  },
  {
    id: "ready-pets",
    title: "Prepare Your Pets for Disasters",
    publisher: "Ready.gov (FEMA)",
    url: "https://www.ready.gov/pets",
    accessed: ACCESSED,
  },

  // Hazards
  {
    id: "ready-hurricanes",
    title: "Hurricanes",
    publisher: "Ready.gov (FEMA)",
    url: "https://www.ready.gov/hurricanes",
    accessed: ACCESSED,
  },
  {
    id: "ready-wildfires",
    title: "Wildfires",
    publisher: "Ready.gov (FEMA)",
    url: "https://www.ready.gov/wildfires",
    accessed: ACCESSED,
  },
  {
    id: "ready-earthquakes",
    title: "Earthquakes",
    publisher: "Ready.gov (FEMA)",
    url: "https://www.ready.gov/earthquakes",
    accessed: ACCESSED,
  },
  {
    id: "ready-winter-weather",
    title: "Winter Weather",
    publisher: "Ready.gov (FEMA)",
    url: "https://www.ready.gov/winter-weather",
    accessed: ACCESSED,
  },
  {
    id: "ready-floods",
    title: "Floods",
    publisher: "Ready.gov (FEMA)",
    url: "https://www.ready.gov/floods",
    accessed: ACCESSED,
  },
  {
    id: "ready-tornadoes",
    title: "Tornadoes",
    publisher: "Ready.gov (FEMA)",
    url: "https://www.ready.gov/tornadoes",
    accessed: ACCESSED,
  },
  {
    id: "ready-heat",
    title: "Extreme Heat",
    publisher: "Ready.gov (FEMA)",
    url: "https://www.ready.gov/heat",
    accessed: ACCESSED,
  },
  {
    id: "ready-volcanoes",
    title: "Volcanoes",
    publisher: "Ready.gov (FEMA)",
    url: "https://www.ready.gov/volcanoes",
    accessed: ACCESSED,
  },
  {
    id: "ready-tsunamis",
    title: "Tsunamis",
    publisher: "Ready.gov (FEMA)",
    url: "https://www.ready.gov/tsunamis",
    accessed: ACCESSED,
  },

  // Container
  {
    id: "hd-hdx-27gal-tote",
    title:
      "HDX 27 Gal. Tough Storage Tote in Black and Yellow (Model 999-27G-HDX)",
    publisher: "The Home Depot",
    url: "https://www.homedepot.com/p/HDX-27-Gal-Tough-Storage-Tote-in-Black-and-Yellow-999-27G-HDX/327528802",
    accessed: null,
    note: "HDX is a Home Depot brand, so this listing is the manufacturer page. It returned HTTP 403 to automated requests on 2026-10-11, so no dimension is verified yet.",
  },
] as const satisfies readonly Source[];

export type SourceId = (typeof SOURCES)[number]["id"];

export function getSource(id: SourceId): Source {
  const source = SOURCES.find((s) => s.id === id);
  if (!source) {
    throw new Error(`Unknown source id: ${id}`);
  }
  return source;
}
