import { beforeEach, describe, expect, it } from "vitest";
import { CATEGORIES, PREP_ITEMS } from "@cafe-listo/shared";
import { InMemoryChecklistRepository } from "../../__tests__/fakes/in-memory-checklist-repository";
import { fixedClock } from "../../__tests__/fakes/fixed-clock";
import { GetChecklist } from "../get-checklist";
import { ResetChecklist } from "../reset-checklist";
import { SetItemDone } from "../set-item-done";

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

describe("checklist use cases", () => {
  let repo: InMemoryChecklistRepository;
  let getChecklist: GetChecklist;
  let setItemDone: SetItemDone;
  let resetChecklist: ResetChecklist;

  beforeEach(() => {
    repo = new InMemoryChecklistRepository();
    const catalog = { categories: CATEGORIES, items: PREP_ITEMS };
    getChecklist = new GetChecklist(repo, catalog);
    setItemDone = new SetItemDone(repo, catalog, fixedClock());
    resetChecklist = new ResetChecklist(repo);
  });

  it("starts with nothing packed", async () => {
    const result = await getChecklist.execute({ userId: ALICE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items).toHaveLength(PREP_ITEMS.length);
    expect(result.data.items.every((i) => !i.done)).toBe(true);
    expect(result.data.progress).toEqual({
      done: 0,
      total: PREP_ITEMS.length,
      percent: 0,
    });
    expect(result.data.categories).toHaveLength(CATEGORIES.length);
  });

  it("marks an item done and reports progress", async () => {
    const set = await setItemDone.execute({
      userId: ALICE,
      itemId: "water-1",
      done: true,
    });
    expect(set).toEqual({ ok: true, data: { itemId: "water-1", done: true } });

    const result = await getChecklist.execute({ userId: ALICE });
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.items.find((i) => i.id === "water-1")?.done).toBe(true);
    expect(result.data.progress.done).toBe(1);
    const water = result.data.categories.find((c) => c.id === "water");
    expect(water?.done).toBe(1);
    expect(water?.total).toBe(
      PREP_ITEMS.filter((i) => i.categoryId === "water").length,
    );
  });

  it("is idempotent when setting the same value twice", async () => {
    const input = { userId: ALICE, itemId: "water-1", done: true };
    await setItemDone.execute(input);
    const second = await setItemDone.execute(input);

    expect(second.ok).toBe(true);
    expect(await repo.getEntries(ALICE)).toHaveLength(1);
  });

  it("returns not_found for an unknown item", async () => {
    const result = await setItemDone.execute({
      userId: ALICE,
      itemId: "water-999",
      done: true,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "not_found", message: "Item not found: water-999" },
    });
    expect(await repo.getEntries(ALICE)).toHaveLength(0);
  });

  it("ignores stored entries for items no longer in the catalog", async () => {
    await repo.saveEntries(ALICE, [
      {
        itemId: "retired-item",
        status: "packed",
        quantity: null,
        packedAt: new Date(),
        expiresOn: null,
        updatedAt: new Date(),
      },
    ]);

    const result = await getChecklist.execute({ userId: ALICE });

    if (!result.ok) throw new Error("expected ok");
    expect(result.data.progress.done).toBe(0);
  });

  describe("set_item_done shim over status", () => {
    it("maps done to packed and stamps packedAt", async () => {
      await setItemDone.execute({
        userId: ALICE,
        itemId: "water-1",
        done: true,
      });

      expect(await repo.getEntries(ALICE)).toEqual([
        {
          itemId: "water-1",
          status: "packed",
          quantity: null,
          packedAt: new Date("2026-01-01T00:00:00.000Z"),
          expiresOn: null,
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ]);
    });

    it("keeps a bought quantity and expiry when packing", async () => {
      await repo.saveEntries(ALICE, [
        {
          itemId: "water-1",
          status: "bought",
          quantity: 4,
          packedAt: null,
          expiresOn: "2027-01-01",
          updatedAt: new Date("2025-12-01T00:00:00.000Z"),
        },
      ]);

      await setItemDone.execute({
        userId: ALICE,
        itemId: "water-1",
        done: true,
      });

      expect((await repo.getEntries(ALICE))[0]).toMatchObject({
        status: "packed",
        quantity: 4,
        expiresOn: "2027-01-01",
      });
    });

    it("maps not done to needed and clears the packed details", async () => {
      await setItemDone.execute({
        userId: ALICE,
        itemId: "water-1",
        done: true,
      });

      await setItemDone.execute({
        userId: ALICE,
        itemId: "water-1",
        done: false,
      });

      expect((await repo.getEntries(ALICE))[0]).toMatchObject({
        status: "needed",
        quantity: null,
        packedAt: null,
      });
    });

    it("counts only packed items as done in get_checklist", async () => {
      await repo.saveEntries(ALICE, [
        {
          itemId: "water-1",
          status: "bought",
          quantity: null,
          packedAt: null,
          expiresOn: null,
          updatedAt: new Date(),
        },
      ]);

      const result = await getChecklist.execute({ userId: ALICE });

      if (!result.ok) throw new Error("expected ok");
      expect(result.data.progress.done).toBe(0);
    });
  });

  it("resets the checklist", async () => {
    await setItemDone.execute({ userId: ALICE, itemId: "water-1", done: true });

    const reset = await resetChecklist.execute({ userId: ALICE });
    expect(reset).toEqual({ ok: true, data: { reset: true } });

    const result = await getChecklist.execute({ userId: ALICE });
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.progress.done).toBe(0);
  });

  describe("tenant isolation", () => {
    it("never shows one user's writes to another", async () => {
      await setItemDone.execute({
        userId: ALICE,
        itemId: "water-1",
        done: true,
      });

      const bob = await getChecklist.execute({ userId: BOB });

      if (!bob.ok) throw new Error("expected ok");
      expect(bob.data.progress.done).toBe(0);
    });

    it("only resets the caller's checklist", async () => {
      await setItemDone.execute({
        userId: ALICE,
        itemId: "water-1",
        done: true,
      });

      await resetChecklist.execute({ userId: BOB });

      const alice = await getChecklist.execute({ userId: ALICE });
      if (!alice.ok) throw new Error("expected ok");
      expect(alice.data.progress.done).toBe(1);
    });
  });
});
