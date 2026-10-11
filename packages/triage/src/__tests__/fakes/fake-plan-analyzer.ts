import type { AnalyzerInput, PlanAnalyzer } from "../../ports";

/** Returns canned raw output (or computes it from the input) and records what it was shown. */
export class FakePlanAnalyzer implements PlanAnalyzer {
  readonly inputs: AnalyzerInput[] = [];

  constructor(public output: unknown) {}

  async analyze(input: AnalyzerInput): Promise<unknown> {
    this.inputs.push(structuredClone(input));
    const output =
      typeof this.output === "function" ? this.output(input) : this.output;
    return structuredClone(output);
  }
}

/** A plan that skips every feedback row it is shown. */
export function skipEverything(input: AnalyzerInput) {
  return {
    summary: "Skipped everything.",
    actions: input.feedback.map((f) => ({
      type: "skip",
      feedback_ids: [f.id],
      reason: "Test.",
    })),
  };
}
