import { isToolName } from "../tool-registry";
import {
  buildMcpPromptList,
  isPromptName,
  PREP_MY_TOTE_PROMPT,
  renderMcpPrompt,
} from "../prompts";

function textOf(args?: Record<string, string>): string {
  const result = renderMcpPrompt(PREP_MY_TOTE_PROMPT, args);
  if (!result.ok) throw new Error(result.message);
  return result.prompt.messages[0].content.text;
}

describe("buildMcpPromptList", () => {
  it("lists prep_my_tote with one optional location argument", () => {
    expect(buildMcpPromptList()).toEqual([
      expect.objectContaining({
        name: "prep_my_tote",
        title: "Prep my tote",
        arguments: [
          expect.objectContaining({ name: "location", required: false }),
        ],
      }),
    ]);
  });
});

describe("isPromptName", () => {
  it("knows prep_my_tote and nothing else", () => {
    expect(isPromptName("prep_my_tote")).toBe(true);
    expect(isPromptName("get_tote")).toBe(false);
  });
});

describe("renderMcpPrompt(prep_my_tote)", () => {
  it("walks location, household, save, shopping list, then tracking", () => {
    const text = textOf();
    const order = [
      "get_household",
      "set_household",
      "build_shopping_list",
      "update_items",
    ].map((tool) => text.indexOf(tool));

    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("asks rather than guesses and never asks for a street address", () => {
    const text = textOf();

    expect(text).toMatch(/ask rather than guess/i);
    expect(text).toMatch(/never ask for, repeat, or save a street address/i);
    expect(text).toMatch(/cite the source titles and URLs/i);
  });

  it("mentions only real tool names", () => {
    const text = textOf();
    const tools = text.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
    const inputs = ["has_tote", "budget_mode"];
    for (const name of tools.filter((n) => !inputs.includes(n))) {
      expect(isToolName(name)).toBe(true);
    }
  });

  it("keeps the copy provider-agnostic", () => {
    const listing = buildMcpPromptList()[0];
    const copy = [
      textOf(),
      listing.description,
      ...listing.arguments.map((a) => a.description),
    ].join(" ");

    expect(copy).not.toMatch(/claude|anthropic/i);
  });

  it("asks the assistant to confirm a given state, upper-cased", () => {
    expect(textOf({ location: " az " })).toContain(
      "I said I'm in AZ; confirm that with me",
    );
  });

  it("asks where I live only when no location is given", () => {
    expect(textOf({})).toContain("If nothing is saved, ask where I live.");

    const text = textOf({ location: "AZ" });
    expect(text).not.toContain("ask where I live");
    expect(text).toContain(
      "If it differs from what is saved, ask me which is right.",
    );
  });

  it("keeps only the five digits of a ZIP+4", () => {
    const text = textOf({ location: "85201-1234" });

    expect(text).toContain("I said my ZIP is 85201; confirm that with me");
    expect(text).not.toContain("1234");
  });

  it.each([
    ["a street address", { location: "123 Main St, Mesa AZ" }],
    ["an unknown state", { location: "ZZ" }],
    ["a short ZIP", { location: "8520" }],
    ["an unknown argument", { address: "123 Main St" }],
  ])("rejects %s", (_label, args) => {
    const result = renderMcpPrompt(PREP_MY_TOTE_PROMPT, args);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/^Invalid arguments for prep_my_tote: /);
    }
  });
});
