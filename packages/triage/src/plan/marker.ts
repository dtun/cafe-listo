/** Hidden in every filed body; lets a resumed plan find what already reached GitHub. */
export const MARKER_PATTERN = /^<!-- triage:[A-Za-z0-9-]{1,64}:\d{1,4} -->$/;

export function provenanceMarker(planId: string, index: number): string {
  const marker = `<!-- triage:${planId}:${index} -->`;
  if (!MARKER_PATTERN.test(marker))
    throw new Error("malformed plan id or index");
  return marker;
}

/** The footer appended to every filed issue or comment (after validation). */
export function provenanceFooter(
  feedbackIds: string[],
  planId: string,
  index: number,
): string {
  return `\n\n---\n<sub>Filed by the weekly feedback triage loop from feedback records: ${feedbackIds.join(", ")}</sub>\n${provenanceMarker(planId, index)}`;
}
