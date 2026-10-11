import { describe, expect, it } from "vitest";
import { validatePlan } from "../index";
import { CONTEXT, planWith, planWithBodyText } from "./fixtures";

const rules = (plan: Parameters<typeof validatePlan>[0]) =>
  validatePlan(plan, CONTEXT).map((p) => p.rule);

describe("validatePlan: links", () => {
  it.each([
    ["https url", "see https://evil.example/login"],
    ["http url", "see http://evil.example"],
    ["uppercase scheme", "HTTPS://EVIL.EXAMPLE"],
    ["www host", "visit www.evil.example"],
    ["scheme-relative link", "go to //evil.example/reset"],
    ["scheme-relative markdown link", "[reset your password](//evil.example)"],
    ["markdown link to a path", "[docs](/docs/setup)"],
    ["markdown link to an anchor", "[see above](#evidence)"],
    ["markdown reference link", "[reset][1]\n\n[1]: //evil.example"],
    ["markdown link definition", "[1]: /reset"],
    ["markdown image", "![logo](//evil.example/x.png)"],
    ["html anchor", '<a href="//evil.example">here</a>'],
    ["html anchor in single quotes", "<a href='/x'>here</a>"],
    ["html image", '<img src="//evil.example/p.gif">'],
    ["html comment", "<!-- hidden -->"],
    ["autolink", "<https://evil.example>"],
    ["bare host with a path", "go to evil.example/reset"],
    ["bare subdomain with a path", "login.evil-site.co/account"],
    ["bare common TLD", "reset it at evil.com"],
    ["bare io host", "status at status.evil.io"],
  ])("rejects a %s", (_name, text) => {
    expect(rules(planWithBodyText(text))).toContain("link");
  });

  it.each([
    ["plain #N refs", "Follow-up to #5, related to #12"],
    ["file names", "the package.json and index.ts in README.md"],
    ["a source path", "see src/plan/validate.ts"],
    ["slashes in prose", "24/7 access, and/or 1/2 gallon per person"],
    ["comparisons", "a < b and b > a"],
    ["abbreviations", "e.g. water, i.e. 1 gallon"],
    [
      "markdown structure",
      "## Evidence\n- 2 reports\n- [ ] not a link\n**bold**",
    ],
  ])("allows %s", (_name, text) => {
    expect(rules(planWithBodyText(text))).not.toContain("link");
  });

  it("checks titles too", () => {
    expect(
      rules(planWith(0, { title: "feat(mobile): see //x.example now" })),
    ).toContain("link");
  });

  it("checks comments too", () => {
    expect(
      rules(planWith(1, { body: "New feedback: [x](//e.example)" })),
    ).toContain("link");
  });
});
