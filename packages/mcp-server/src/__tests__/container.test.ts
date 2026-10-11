import { describe, expect, it } from "vitest";
import { buildContainer, supabaseUseCasesFor } from "../container";
import { fixedClock } from "./fakes/fixed-clock";
import { InMemoryChecklistRepository } from "./fakes/in-memory-checklist-repository";
import { InMemoryFeedbackRepository } from "./fakes/in-memory-feedback-repository";
import { InMemoryProfileRepository } from "./fakes/in-memory-profile-repository";

describe("buildContainer", () => {
  it("wires use cases to the injected repository and clock", async () => {
    const repo = new InMemoryChecklistRepository();
    const usecases = buildContainer(
      {
        checklistRepository: repo,
        feedbackRepository: new InMemoryFeedbackRepository(),
        profileRepository: new InMemoryProfileRepository(),
      },
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
        status: "packed",
        quantity: null,
        packedAt: new Date("2026-05-05T00:00:00.000Z"),
        expiresOn: null,
        updatedAt: new Date("2026-05-05T00:00:00.000Z"),
      },
    ]);
    expect(Object.isFrozen(usecases)).toBe(true);
  });
});

describe("supabaseUseCasesFor", () => {
  it("builds request-scoped use cases without touching the network", () => {
    const useCasesFor = supabaseUseCasesFor({
      url: "http://127.0.0.1:54321",
      anonKey: "anon",
    });

    const usecases = useCasesFor({ userId: "u1", accessToken: "jwt" });

    expect(Object.keys(usecases).sort()).toEqual([
      "getChecklist",
      "getHousehold",
      "listCategories",
      "listItems",
      "resetChecklist",
      "setHousehold",
      "setItemDone",
      "submitFeedback",
      "updateItems",
    ]);
  });
});
