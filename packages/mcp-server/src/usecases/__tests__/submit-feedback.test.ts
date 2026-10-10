import { describe, expect, it } from "vitest";
import { InMemoryFeedbackRepository } from "../../__tests__/fakes/in-memory-feedback-repository";
import { fixedClock } from "../../__tests__/fakes/fixed-clock";
import { sequentialIds } from "../../__tests__/fakes/sequential-ids";
import { SubmitFeedback } from "../submit-feedback";

const ALICE = "11111111-1111-1111-1111-111111111111";
const NOW = "2026-10-10T12:00:00.000Z";

function setup() {
  const repo = new InMemoryFeedbackRepository();
  const submit = new SubmitFeedback(repo, fixedClock(NOW), sequentialIds());
  return { repo, submit };
}

describe("SubmitFeedback", () => {
  it("stores the feedback for the caller and returns its id and time", async () => {
    const { repo, submit } = setup();

    const result = await submit.execute({
      userId: ALICE,
      kind: "gap",
      summary: "No pet supplies in the catalog",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        id: "00000000-0000-4000-8000-000000000001",
        receivedAt: new Date(NOW),
      },
    });
    expect(repo.rows).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000001",
        userId: ALICE,
        kind: "gap",
        summary: "No pet supplies in the catalog",
        createdAt: new Date(NOW),
      },
    ]);
  });

  it("passes the optional fields through", async () => {
    const { repo, submit } = setup();

    await submit.execute({
      userId: ALICE,
      kind: "content_error",
      summary: "Water amount looks low",
      details: "Family of four, 3 days.",
      toolName: "list_items",
      itemId: "water-1",
      userQuote: "that can't be enough",
    });

    expect(repo.rows[0]).toEqual(
      expect.objectContaining({
        details: "Family of four, 3 days.",
        toolName: "list_items",
        itemId: "water-1",
        userQuote: "that can't be enough",
      }),
    );
  });

  it("gives each submission its own id", async () => {
    const { repo, submit } = setup();
    const input = {
      userId: ALICE,
      kind: "idea",
      summary: "Dark mode",
    } as const;

    await submit.execute(input);
    await submit.execute(input);

    expect(new Set(repo.rows.map((r) => r.id)).size).toBe(2);
  });
});
