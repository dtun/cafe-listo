import type { AnalyzerInput, PlanAnalyzer } from "../../ports";

/** Returns canned raw output and records what it was shown. */
export class FakePlanAnalyzer implements PlanAnalyzer {
  readonly inputs: AnalyzerInput[] = [];

  constructor(public output: unknown) {}

  async analyze(input: AnalyzerInput): Promise<unknown> {
    this.inputs.push(structuredClone(input));
    return structuredClone(this.output);
  }
}
