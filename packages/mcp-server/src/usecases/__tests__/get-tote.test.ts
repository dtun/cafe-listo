import { beforeEach, describe, expect, it } from "vitest";
import {
  getRegion,
  resolveKit,
  type ChecklistEntry,
  type Household,
  type HouseholdProfile,
} from "@cafe-listo/shared";
import { fixedClock } from "../../__tests__/fakes/fixed-clock";
import { InMemoryChecklistRepository } from "../../__tests__/fakes/in-memory-checklist-repository";
import { InMemoryProfileRepository } from "../../__tests__/fakes/in-memory-profile-repository";
import { GetTote, NO_PROFILE_MESSAGE } from "../get-tote";

const ALICE = "11111111-1111-1111-1111-111111111111";
const NOW = new Date("2026-06-01T00:00:00.000Z");

const household: Household = {
  adults: 1,
  seniors: 0,
  children: { count: 0 },
  infants: 0,
  pets: { dogs: 0, cats: 0, other: 0 },
  medical: { needs: [], flags: [] },
  dietary: [],
  days: 3,
};

const profile: HouseholdProfile = {
  region: 9,
  state: "AZ",
  zip: "85201",
  household,
  updatedAt: NOW,
};

const kit = resolveKit(9, household, { state: "AZ" });

function packed(
  itemId: string,
  overrides: Partial<ChecklistEntry> = {},
): ChecklistEntry {
  return {
    itemId,
    status: "packed",
    quantity: null,
    packedAt: NOW,
    expiresOn: null,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("GetTote", () => {
  let profiles: InMemoryProfileRepository;
  let checklist: InMemoryChecklistRepository;
  let getTote: GetTote;

  beforeEach(async () => {
    profiles = new InMemoryProfileRepository();
    checklist = new InMemoryChecklistRepository();
    getTote = new GetTote(
      profiles,
      checklist,
      fixedClock("2026-06-01T09:00:00.000Z"),
    );
    await profiles.save(ALICE, profile);
  });

  async function view() {
    const result = await getTote.execute({ userId: ALICE });
    if (!result.ok) throw new Error(result.error.message);
    return result.data;
  }

  it("tells the assistant to call set_household when there is no profile", async () => {
    const result = await getTote.execute({ userId: "nobody" });

    expect(result).toEqual({
      ok: false,
      error: { code: "not_found", message: NO_PROFILE_MESSAGE },
    });
    expect(NO_PROFILE_MESSAGE).toMatch(/call set_household first/i);
  });

  it("resolves the kit for the saved profile with everything needed", async () => {
    const tote = await view();

    expect(tote.region.id).toBe(9);
    expect(tote.lines.map((l) => l.item.id)).toEqual(kit.map((i) => i.id));
    expect(tote.counts).toEqual({
      needed: kit.length,
      bought: 0,
      packed: 0,
      total: kit.length,
    });
    expect(tote.readinessPercent).toBe(0);
    expect(tote.hazards.map((h) => h.hazard)).toEqual(
      getRegion(9).hazards.map((h) => h.hazard),
    );
    expect(tote.hazards.every((h) => !h.covered)).toBe(true);
  });

  it("joins stored statuses and ignores entries outside the kit", async () => {
    const [first, second] = kit;
    await checklist.saveEntries(ALICE, [
      packed(first.id),
      packed(second.id, { status: "bought", packedAt: null }),
      // Infant formula is not in a kit with no infants.
      packed("food-8"),
    ]);

    const tote = await view();

    expect(tote.counts).toMatchObject({ packed: 1, bought: 1 });
    expect(tote.lines[0].entry?.status).toBe("packed");
    expect(tote.lines.some((l) => l.item.id === "food-8")).toBe(false);
  });

  it("weights essentials twice in readiness", async () => {
    const essentials = kit.filter((i) => i.essential);
    await checklist.saveEntries(
      ALICE,
      essentials.map((i) => packed(i.id)),
    );

    const tote = await view();

    const others = kit.length - essentials.length;
    expect(tote.readinessPercent).toBe(
      Math.floor(
        (100 * 2 * essentials.length) / (2 * essentials.length + others),
      ),
    );
  });

  it("reaches 100% and covers every hazard when the whole kit is packed", async () => {
    await checklist.saveEntries(
      ALICE,
      kit.map((i) => packed(i.id)),
    );

    const tote = await view();

    expect(tote.readinessPercent).toBe(100);
    expect(tote.counts.packed).toBe(kit.length);
    expect(tote.hazards.every((h) => h.covered)).toBe(true);
  });

  it("plans the fit over the whole kit, whatever is packed", async () => {
    const before = (await view()).pack;
    await checklist.saveEntries(ALICE, [packed(kit[0].id)]);
    const after = (await view()).pack;

    expect(after).toEqual(before);
    expect(before.fillPercent).toBeGreaterThan(0);
    // Bulk water is never packable, so it always lands beside the tote.
    expect(
      before.overflow.some(
        (o) => o.id === "water-1" && o.reason === "not-packable",
      ),
    ).toBe(true);
  });

  it("lists items expiring within 60 days from the label or the shelf life", async () => {
    const withShelfLife = kit.find(
      (i) => i.shelfLifeMonths !== null && i.shelfLifeMonths <= 12,
    );
    if (!withShelfLife) throw new Error("fixture needs a perishable item");
    const labelled = kit.find((i) => i.id !== withShelfLife.id);
    if (!labelled) throw new Error("fixture needs two items");
    // Packed so that its shelf life ends on 2026-06-20 (month 5 is June).
    const packedAt = new Date(
      Date.UTC(2026, 5 - (withShelfLife.shelfLifeMonths ?? 0), 20),
    );

    await checklist.saveEntries(ALICE, [
      packed(withShelfLife.id, { packedAt }),
      packed(labelled.id, { status: "bought", expiresOn: "2026-06-11" }),
    ]);

    const tote = await view();

    expect(
      tote.expiring.map((e) => [
        e.item.id,
        e.expiresOn,
        e.daysLeft,
        e.estimated,
      ]),
    ).toEqual([
      [labelled.id, "2026-06-11", 10, false],
      [withShelfLife.id, "2026-06-20", 19, true],
    ]);
  });
});
