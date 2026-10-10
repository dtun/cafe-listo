import { describe, expect, it } from "vitest";
import { buildContainer } from "../container";
import { fixedClock } from "./fakes/fixed-clock";
import { InMemoryChecklistRepository } from "./fakes/in-memory-checklist-repository";

describe("buildContainer", () => {
  it("wires use cases to the injected repository and clock", async () => {
    const repo = new InMemoryChecklistRepository();
    const usecases = buildContainer(
      { checklistRepository: repo },
      { clock: fixedClock("2026-05-05T00:00:00.000Z") },
    );

    await usecases.setItemDone.execute({
      userId: "u1",
      itemId: "water-1",
      done: true,
    });

    expect(await repo.getEntries("u1")).toEqual([
      {
        itemId: "water-1",
        done: true,
        updatedAt: new Date("2026-05-05T00:00:00.000Z"),
      },
    ]);
    expect(Object.isFrozen(usecases)).toBe(true);
  });
});
