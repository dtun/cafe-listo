import type { ChecklistEntry } from "../ports";
import { applyItemUpdate } from "../update";

const T0 = new Date("2026-01-01T00:00:00Z");
const T1 = new Date("2026-02-01T00:00:00Z");

const packed: ChecklistEntry = {
  itemId: "water-1",
  status: "packed",
  quantity: 3,
  packedAt: T0,
  expiresOn: "2027-01-01",
  updatedAt: T0,
};

describe("applyItemUpdate", () => {
  it("starts a new item as needed with nothing recorded", () => {
    expect(applyItemUpdate(undefined, { itemId: "water-1" }, T1)).toEqual({
      itemId: "water-1",
      status: "needed",
      quantity: null,
      packedAt: null,
      expiresOn: null,
      updatedAt: T1,
    });
  });

  it("stamps packedAt when an item moves to packed", () => {
    const bought = applyItemUpdate(
      undefined,
      { itemId: "water-1", status: "bought", quantity: 2 },
      T0,
    );
    expect(bought).toMatchObject({ status: "bought", packedAt: null });

    expect(
      applyItemUpdate(bought, { itemId: "water-1", status: "packed" }, T1),
    ).toMatchObject({ status: "packed", quantity: 2, packedAt: T1 });
  });

  it("keeps packedAt while the item stays packed, so repeats are no-ops", () => {
    const again = applyItemUpdate(
      packed,
      { itemId: "water-1", status: "packed" },
      T1,
    );
    expect(again).toEqual({ ...packed, updatedAt: T1 });
  });

  it("clears packedAt when an item leaves packed", () => {
    expect(
      applyItemUpdate(packed, { itemId: "water-1", status: "bought" }, T1),
    ).toMatchObject({ status: "bought", quantity: 3, packedAt: null });
  });

  it("clears quantity when moved back to needed unless one is given", () => {
    expect(
      applyItemUpdate(packed, { itemId: "water-1", status: "needed" }, T1),
    ).toMatchObject({ status: "needed", quantity: null });
    expect(
      applyItemUpdate(
        packed,
        { itemId: "water-1", status: "needed", quantity: 1 },
        T1,
      ),
    ).toMatchObject({ status: "needed", quantity: 1 });
  });

  it("updates quantity or expiry alone without changing status", () => {
    expect(
      applyItemUpdate(packed, { itemId: "water-1", quantity: 5 }, T1),
    ).toMatchObject({ status: "packed", quantity: 5, packedAt: T0 });
    expect(
      applyItemUpdate(packed, { itemId: "water-1", expiresOn: null }, T1),
    ).toMatchObject({ expiresOn: null, quantity: 3 });
  });
});
