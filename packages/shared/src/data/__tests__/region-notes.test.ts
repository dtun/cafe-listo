import { BASE_PREP_ITEMS, PREP_ITEMS } from "../../seed-data";
import { regionForState } from "../fema-regions";
import {
  MESA_AZ_OVERLAY,
  REGION_NOTE_OVERLAYS,
  applyRegionNotes,
  regionNotesFor,
} from "../region-notes";

const itemIds = new Set(BASE_PREP_ITEMS.map((i) => i.id));

describe("REGION_NOTE_OVERLAYS", () => {
  test("ids are unique", () => {
    const ids = REGION_NOTE_OVERLAYS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every note targets a seed item", () => {
    for (const overlay of REGION_NOTE_OVERLAYS) {
      for (const id of Object.keys(overlay.notes)) {
        expect(itemIds.has(id)).toBe(true);
      }
    }
  });

  test("a state overlay's state is in its region", () => {
    for (const overlay of REGION_NOTE_OVERLAYS) {
      if (overlay.state !== null) {
        expect(regionForState(overlay.state)?.id).toBe(overlay.region);
      }
    }
  });

  test("the Mesa notes are the Region 9 / Arizona overlay", () => {
    expect(MESA_AZ_OVERLAY.region).toBe(9);
    expect(MESA_AZ_OVERLAY.state).toBe("AZ");
    expect(Object.keys(MESA_AZ_OVERLAY.notes)).toHaveLength(28);
  });
});

describe("regionNotesFor", () => {
  test("returns the Mesa notes for Region 9 / AZ", () => {
    expect(regionNotesFor(9, "AZ")).toEqual(MESA_AZ_OVERLAY.notes);
  });

  test("does not apply the Arizona overlay to other Region 9 states", () => {
    expect(regionNotesFor(9, "CA")).toEqual({});
    expect(regionNotesFor(9)).toEqual({});
  });

  test("returns no notes for regions without overlays", () => {
    expect(regionNotesFor(1, "MA")).toEqual({});
  });
});

describe("applyRegionNotes", () => {
  test("sets notes by item id and nulls the rest", () => {
    const items = applyRegionNotes(BASE_PREP_ITEMS, { "water-3": "note" });
    expect(items.find((i) => i.id === "water-3")?.regionNote).toBe("note");
    expect(items.filter((i) => i.regionNote !== null)).toHaveLength(1);
  });

  test("base items carry no notes", () => {
    expect(BASE_PREP_ITEMS.every((i) => i.regionNote === null)).toBe(true);
  });

  test("the default seed keeps the Mesa notes", () => {
    for (const item of PREP_ITEMS) {
      expect(item.regionNote).toBe(MESA_AZ_OVERLAY.notes[item.id] ?? null);
    }
  });
});
