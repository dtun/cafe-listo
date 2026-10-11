import { beforeEach, describe, expect, it } from "vitest";
import {
  HDX_27_GAL_TOTE,
  resolveKit,
  type ChecklistEntry,
  type HouseholdProfile,
} from "@cafe-listo/shared";
import {
  HOUSEHOLD_FIXTURES,
  REGION_FIXTURES,
  type HouseholdFixtureName,
} from "@cafe-listo/shared/fixtures";
import { InMemoryChecklistRepository } from "../../__tests__/fakes/in-memory-checklist-repository";
import { InMemoryProfileRepository } from "../../__tests__/fakes/in-memory-profile-repository";
import { shoppingListDto } from "../../dto/shopping-list";
import {
  BuildShoppingList,
  type BuildShoppingListInput,
} from "../build-shopping-list";

const ALICE = "11111111-1111-1111-1111-111111111111";
const NOW = new Date("2026-06-01T00:00:00.000Z");

function profileFor(
  region: (typeof REGION_FIXTURES)[number],
  name: HouseholdFixtureName,
): HouseholdProfile {
  return {
    region: region.region,
    state: region.state,
    zip: null,
    household: HOUSEHOLD_FIXTURES[name],
    updatedAt: NOW,
  };
}

function entry(
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

/** Mesa AZ (heat, wildfire, earthquake), Atlanta GA (hurricane), Chicago IL (tornado, winter). */
const SNAPSHOT_REGIONS = REGION_FIXTURES.filter((r) =>
  [9, 4, 5].includes(r.region),
);
const MESA = REGION_FIXTURES.find((r) => r.region === 9)!;

type ShoppingListDto = ReturnType<typeof shoppingListDto>;

/**
 * One reviewable line per entry. URLs and source titles are left out: both
 * follow from the search term and source id, and are covered by the full
 * wire-shape snapshot and the shared tests.
 */
function summarize(list: ShoppingListDto) {
  return {
    days: list.days,
    has_tote: list.has_tote,
    counts: list.counts,
    stores: list.stores.map((s) => [
      s.store,
      ...s.lines.map((l) =>
        [
          l.item_id,
          `x${l.quantity}`,
          l.purchase_unit,
          "have" in l ? `have ${l.have}` : "",
          l.essential ? "essential" : "",
          "hazards" in l ? `[${l.hazards?.join(", ")}]` : "",
          `{${l.sources.join(", ")}}`,
        ]
          .filter(Boolean)
          .join(" "),
      ),
    ]),
    gather: list.gather.map((g) => `${g.item_id} x${g.quantity}`),
    fit: {
      fill_percent: list.fit.fill_percent,
      weight_kg: list.fit.weight_kg,
      in_tote: list.fit.in_tote.length,
      beside_tote: list.fit.beside_tote.map(
        (b) => `${b.item_id} x${b.quantity} ${b.reason}`,
      ),
      warnings: list.fit.warnings.length,
    },
    hazards: list.hazards.map(
      (h) => `${h.hazard} ${h.relevance} {${h.sources.join(", ")}}`,
    ),
    sources: Object.keys(list.sources),
  };
}

describe("BuildShoppingList", () => {
  let profiles: InMemoryProfileRepository;
  let checklist: InMemoryChecklistRepository;
  let usecase: BuildShoppingList;

  beforeEach(() => {
    profiles = new InMemoryProfileRepository();
    checklist = new InMemoryChecklistRepository();
    usecase = new BuildShoppingList(profiles, checklist);
  });

  async function dto(input: Partial<BuildShoppingListInput> = {}) {
    const result = await usecase.execute({ userId: ALICE, ...input });
    if (!result.ok) throw new Error(result.error.message);
    return shoppingListDto(result.data);
  }

  const lineIds = (list: Awaited<ReturnType<typeof dto>>) =>
    list.stores.flatMap((s) => s.lines.map((l) => l.item_id));
  const findLine = (list: Awaited<ReturnType<typeof dto>>, id: string) =>
    list.stores.flatMap((s) => s.lines).find((l) => l.item_id === id);

  it("asks the assistant to call set_household first when there is no profile", async () => {
    const result = await usecase.execute({ userId: "nobody" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("not_found");
    expect(result.error.message).toMatch(/call set_household first/i);
    expect(result.error.message).toMatch(/call build_shopping_list again/);
  });

  describe("snapshots", () => {
    const households = Object.keys(
      HOUSEHOLD_FIXTURES,
    ) as HouseholdFixtureName[];

    describe.each(SNAPSHOT_REGIONS)("region $region ($place)", (region) => {
      it.each(households)("%s", async (name) => {
        await profiles.save(ALICE, profileFor(region, name));
        // A few things already in hand, one of them partly.
        // Nothing packed, so the tote is inferred missing and is line 1.
        await checklist.saveEntries(ALICE, [
          entry("water-2", { status: "bought", packedAt: null }),
          entry("water-1", { status: "bought", quantity: 2, packedAt: null }),
          entry("tools-1", { status: "bought", packedAt: null }),
        ]);

        expect(summarize(await dto())).toMatchSnapshot();
      });
    });

    it("keeps the full wire shape for one household", async () => {
      await profiles.save(ALICE, profileFor(MESA, "single-adult"));
      await checklist.saveEntries(ALICE, [
        entry("water-1", { status: "packed", quantity: 1 }),
      ]);

      expect(await dto({ budgetMode: true })).toMatchSnapshot();
    });
  });

  describe("with a saved profile", () => {
    beforeEach(async () => {
      await profiles.save(ALICE, profileFor(MESA, "single-adult"));
    });

    it("lists the whole kit with the tote first when nothing is bought yet", async () => {
      const kit = resolveKit(9, HOUSEHOLD_FIXTURES["single-adult"], {
        state: "AZ",
      });

      const list = await dto();

      expect(list.has_tote).toBe(false);
      expect(list.has_tote_inferred).toBe(true);
      expect(lineIds(list)[0]).toBe(HDX_27_GAL_TOTE.id);
      expect(list.counts.done).toBe(0);
      expect(list.counts.lines + list.counts.gather).toBe(kit.length + 1);
    });

    it("subtracts what is bought or packed, and a recorded quantity", async () => {
      await checklist.saveEntries(ALICE, [
        entry("water-2", { status: "bought" }),
        entry("water-1", { status: "packed", quantity: 1 }),
      ]);

      const list = await dto();

      expect(lineIds(list)).not.toContain("water-2");
      // 1 adult × 3 days = 3 jugs, 1 packed.
      expect(findLine(list, "water-1")).toMatchObject({ quantity: 2, have: 1 });
      expect(list.counts.done).toBe(1);
    });

    it("infers a tote once anything is packed, unless told otherwise", async () => {
      await checklist.saveEntries(ALICE, [entry("water-2")]);

      expect((await dto()).has_tote).toBe(true);
      expect(lineIds(await dto())).not.toContain(HDX_27_GAL_TOTE.id);

      const told = await dto({ hasTote: false });
      expect(told).toMatchObject({ has_tote: false, has_tote_inferred: false });
      expect(lineIds(told)[0]).toBe(HDX_27_GAL_TOTE.id);
    });

    it("plans for duration_days without saving it", async () => {
      const list = await dto({ durationDays: 14 });

      expect(list.days).toBe(14);
      expect(findLine(list, "water-1")?.quantity).toBe(14);
      expect((await profiles.get(ALICE))?.household.days).toBe(3);
      expect((await dto()).days).toBe(3);
    });

    it("puts everything in one store group with store_preference", async () => {
      const list = await dto({ storePreference: "online" });

      expect(list.store_preference).toBe("online");
      expect(list.stores.map((s) => s.store)).toEqual(["online"]);
      expect(list.stores[0].lines[0].item_id).toBe(HDX_27_GAL_TOTE.id);
    });

    it("lists only essentials and the tote in budget mode", async () => {
      const full = await dto();
      const budget = await dto({ budgetMode: true });

      const lines = budget.stores.flatMap((s) => s.lines);
      expect(lines.every((l) => l.essential)).toBe(true);
      expect(lines[0].item_id).toBe(HDX_27_GAL_TOTE.id);
      expect(budget.counts.lines + budget.counts.later).toBe(full.counts.lines);
      expect(budget.later.length).toBeGreaterThan(0);
    });

    it("resolves every cited source id once, with title and url", async () => {
      const list = await dto();

      const cited = new Set([
        ...list.stores.flatMap((s) => s.lines.flatMap((l) => l.sources)),
        ...list.gather.flatMap((g) => g.sources),
        ...list.hazards.flatMap((h) => h.sources),
      ]);
      expect(Object.keys(list.sources).sort()).toEqual([...cited].sort());
      for (const source of Object.values(list.sources)) {
        expect(source).toEqual({
          title: expect.any(String),
          url: expect.stringMatching(/^https:\/\//),
        });
      }
      expect(list.hazards.map((h) => h.hazard)).toContain("heat");
    });

    it("explains what goes beside the tote", async () => {
      const { fit } = await dto();

      expect(fit.in_tote.length).toBeGreaterThan(0);
      expect(fit.beside_tote).toContainEqual({
        item_id: "water-1",
        name: "Drinking water",
        quantity: 3,
        reason: "not-packable",
        why: expect.stringMatching(/beside the tote/),
      });
      expect(fit.warnings[0]).toMatch(/approximate/i);
    });
  });
});
