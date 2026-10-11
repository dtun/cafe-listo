import { describe, expect, it } from "vitest";
import { EPOCH_CURSOR, commands, triagePlanJsonSchema } from "../index";

const REPO = "dtun/cafe-listo";

describe("commands", () => {
  it("reads feedback with the linked supabase project of the main checkout", () => {
    const [program, args] = commands.readFeedback("/repo", EPOCH_CURSOR);
    expect(program).toBe("supabase");
    expect(args.slice(0, 7)).toEqual(
      "--workdir /repo db query --linked -o json".split(" "),
    );
    expect(args[7]).toMatch(/^select /);
  });

  it("refuses a malformed cursor before building SQL", () => {
    expect(() =>
      commands.readFeedback("/repo", { createdAt: "x' or 1=1", id: "a" }),
    ).toThrow(/malformed cursor/);
  });

  it("runs claude with no tools, no MCP, no session and the plan schema", () => {
    expect(commands.analyze()).toEqual([
      "claude",
      [
        "-p",
        "--tools",
        "",
        "--strict-mcp-config",
        "--no-session-persistence",
        "--output-format",
        "json",
        "--json-schema",
        JSON.stringify(triagePlanJsonSchema()),
      ],
    ]);
  });

  it("creates issues with flag-safe values and the body on stdin", () => {
    expect(
      commands.createIssue(REPO, "--help; rm -rf ~", [
        "feedback",
        "needs-triage",
      ]),
    ).toEqual([
      "gh",
      [
        "issue",
        "create",
        "--repo=dtun/cafe-listo",
        "--title=--help; rm -rf ~",
        "--label=feedback",
        "--label=needs-triage",
        "--body-file=-",
      ],
    ]);
  });

  it("comments with the body on stdin", () => {
    expect(commands.comment(REPO, 12)).toEqual([
      "gh",
      ["issue", "comment", "12", "--repo=dtun/cafe-listo", "--body-file=-"],
    ]);
  });

  it.each([0, -1, 1.5, undefined])("refuses issue number %s", (n) => {
    expect(() => commands.comment(REPO, n)).toThrow(/issue number/);
    expect(() => commands.listComments(REPO, n)).toThrow(/issue number/);
  });

  it.each(["--repo=x", "a b/c", "owner"])("refuses repo %j", (repo) => {
    expect(() => commands.listOpenIssues(repo)).toThrow(/owner\/name/);
  });

  it("lists open issues with the fields dedupe needs", () => {
    expect(commands.listOpenIssues(REPO)[1]).toEqual([
      "issue",
      "list",
      "--repo=dtun/cafe-listo",
      "--state=open",
      "--limit=300",
      "--json=number,state,title,labels,body,author",
    ]);
  });

  it("lists issues closed since a day", () => {
    const [, args] = commands.listClosedIssues(
      REPO,
      new Date("2026-07-12T08:07:00Z"),
    );
    expect(args).toContain("--search=closed:>=2026-07-12");
    expect(args).toContain("--state=closed");
  });

  it("counts open issues through GraphQL", () => {
    expect(commands.countOpenIssues(REPO)[1]).toEqual(
      expect.arrayContaining(["api", "graphql", "o=dtun", "n=cafe-listo"]),
    );
  });

  it("looks for markers among the loop's recent issues", () => {
    expect(commands.listLoopIssues(REPO)[1]).toEqual([
      "issue",
      "list",
      "--repo=dtun/cafe-listo",
      "--state=all",
      "--label=feedback",
      "--limit=100",
      "--json=url,body",
    ]);
  });

  it("passes a notification as an argv item, not script text", () => {
    const [program, args] = commands.notify('3 triaged" & do shell script "x');
    expect(program).toBe("osascript");
    expect(args.at(-1)).toBe('3 triaged" & do shell script "x');
    expect(args.slice(0, -1).join(" ")).not.toContain("triaged");
  });
});
