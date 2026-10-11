import { describe, expect, it } from "vitest";
import { MARKER_PATTERN, provenanceFooter, provenanceMarker } from "../index";

describe("provenance marker", () => {
  it("is a hidden HTML comment naming the plan and action", () => {
    expect(provenanceMarker("plan-1", 3)).toBe("<!-- triage:plan-1:3 -->");
    expect(MARKER_PATTERN.test(provenanceMarker("plan-1", 3))).toBe(true);
  });

  it.each([
    ["a plan id with spaces", "a b", 0],
    ["a plan id that closes the comment", "x -->", 0],
    ["a negative index", "plan-1", -1],
  ])("refuses %s", (_name, planId, index) => {
    expect(() => provenanceMarker(planId, index)).toThrow(/malformed/);
  });

  it("ends the footer, after the feedback ids", () => {
    expect(provenanceFooter(["f1", "f2"], "plan-1", 0)).toBe(
      "\n\n---\n<sub>Filed by the weekly feedback triage loop from feedback records: f1, f2</sub>\n<!-- triage:plan-1:0 -->",
    );
  });
});
