import { beforeEach, describe, expect, it } from "vitest";
import { CATALOG_ITEMS } from "@cafe-listo/shared";
import { InMemoryChecklistRepository } from "../../__tests__/fakes/in-memory-checklist-repository";
import { fixedClock } from "../../__tests__/fakes/fixed-clock";
import { UpdateItems } from "../update-items";

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("UpdateItems", () => {
  let repo: InMemoryChecklistRepository;
  let updateItems: UpdateItems;

  beforeEach(() => {
    repo = new InMemoryChecklistRepository();
    updateItems = new UpdateItems(repo, CATALOG_ITEMS, fixedClock());
  });

  it("applies a batch in one write", async () => {
    const result = await updateItems.execute({
      userId: ALICE,
      updates: [
        { itemId: "tools-1", status: "bought" },
        { itemId: "tools-2", status: "bought", quantity: 2 },
        { itemId: "food-1", status: "packed", expiresOn: "2027-03-31" },
      ],
    });

    expect(result).toEqual({
      ok: true,
      data: [
        {
          itemId: "tools-1",
          status: "bought",
          quantity: null,
          packedAt: null,
          expiresOn: null,
          updatedAt: NOW,
        },
        {
          itemId: "tools-2",
          status: "bought",
          quantity: 2,
          packedAt: null,
          expiresOn: null,
          updatedAt: NOW,
        },
        {
          itemId: "food-1",
          status: "packed",
          quantity: null,
          packedAt: NOW,
          expiresOn: "2027-03-31",
          updatedAt: NOW,
        },
      ],
    });
    expect(repo.saves).toBe(1);
    expect(await repo.getEntries(ALICE)).toHaveLength(3);
  });

  it("accepts catalog items that are not in the legacy checklist", async () => {
    const result = await updateItems.execute({
      userId: ALICE,
      updates: [{ itemId: "tools-9", status: "packed" }],
    });

    expect(result.ok).toBe(true);
  });

  it("keeps fields that are left out", async () => {
    await updateItems.execute({
      userId: ALICE,
      updates: [
        {
          itemId: "food-1",
          status: "bought",
          quantity: 3,
          expiresOn: "2027-03-31",
        },
      ],
    });

    await updateItems.execute({
      userId: ALICE,
      updates: [{ itemId: "food-1", status: "packed" }],
    });

    expect(await repo.getEntries(ALICE)).toEqual([
      {
        itemId: "food-1",
        status: "packed",
        quantity: 3,
        packedAt: NOW,
        expiresOn: "2027-03-31",
        updatedAt: NOW,
      },
    ]);
  });

  it("is idempotent", async () => {
    const input = {
      userId: ALICE,
      updates: [{ itemId: "food-1", status: "packed" as const, quantity: 2 }],
    };
    await updateItems.execute(input);
    const first = await repo.getEntries(ALICE);

    const later = new UpdateItems(
      repo,
      CATALOG_ITEMS,
      fixedClock("2026-02-01T00:00:00.000Z"),
    );
    await later.execute(input);

    expect(await repo.getEntries(ALICE)).toEqual([
      { ...first[0], updatedAt: new Date("2026-02-01T00:00:00.000Z") },
    ]);
  });

  it("rejects the whole batch when any id is unknown", async () => {
    const result = await updateItems.execute({
      userId: ALICE,
      updates: [
        { itemId: "food-1", status: "packed" },
        { itemId: "food-999", status: "packed" },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "not_found",
        message:
          "Unknown item ids: food-999. Nothing was saved; use ids from get_tote.",
      },
    });
    expect(repo.saves).toBe(0);
  });

  it("rejects a repeated item id", async () => {
    const result = await updateItems.execute({
      userId: ALICE,
      updates: [
        { itemId: "food-1", status: "bought" },
        { itemId: "food-1", status: "packed" },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "unprocessable" },
    });
    expect(repo.saves).toBe(0);
  });

  it("only touches the caller's rows", async () => {
    await updateItems.execute({
      userId: ALICE,
      updates: [{ itemId: "food-1", status: "packed" }],
    });

    expect(await repo.getEntries(BOB)).toEqual([]);
  });
});
