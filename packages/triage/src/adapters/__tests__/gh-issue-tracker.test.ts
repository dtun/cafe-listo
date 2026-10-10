import { describe, expect, it } from "vitest";
import { FakeExec, stdout } from "../../__tests__/fakes/fake-exec";
import { ExecError } from "../exec";
import { GhIssueTracker } from "../gh-issue-tracker";

const GH_ISSUE = {
  number: 12,
  state: "OPEN",
  title: "feat(mobile): offline mode",
  labels: [{ name: "feature" }],
  body: "x".repeat(1000),
  author: { login: "dtun" },
};

function tracker(fake: FakeExec) {
  return new GhIssueTracker(fake.exec, "dtun/cafe-listo");
}

describe("GhIssueTracker", () => {
  it("lists open issues with the fields dedupe needs", async () => {
    const fake = new FakeExec(() => stdout(JSON.stringify([GH_ISSUE])));
    const issues = await tracker(fake).listOpen(300);

    expect(fake.last).toMatchObject({
      file: "gh",
      args: [
        "issue",
        "list",
        "--repo=dtun/cafe-listo",
        "--state=open",
        "--limit=300",
        "--json=number,state,title,labels,body,author",
      ],
    });
    expect(issues).toEqual([
      {
        number: 12,
        state: "OPEN",
        title: "feat(mobile): offline mode",
        author: "dtun",
        labels: ["feature"],
        body: "x".repeat(400),
      },
    ]);
  });

  it("lists issues closed since a day", async () => {
    const fake = new FakeExec(() =>
      stdout(JSON.stringify([{ ...GH_ISSUE, state: "CLOSED", author: null }])),
    );
    const [issue] = await tracker(fake).listClosedSince(
      new Date("2026-07-12T08:07:00Z"),
      200,
    );
    expect(fake.last.args).toContain("--search=closed:>=2026-07-12");
    expect(fake.last.args).toContain("--state=closed");
    expect(issue.author).toBe("");
  });

  it("counts open issues through GraphQL", async () => {
    const fake = new FakeExec(() => stdout("17\n"));
    expect(await tracker(fake).openCount()).toBe(17);
    expect(fake.last.args).toEqual(
      expect.arrayContaining([
        "api",
        "graphql",
        "owner=dtun",
        "name=cafe-listo",
      ]),
    );
  });

  it("rejects a non-numeric count", async () => {
    const fake = new FakeExec(() => stdout("null"));
    await expect(tracker(fake).openCount()).rejects.toThrow(
      /bad open issue count/,
    );
  });

  it("creates issues with the body on stdin and flag-safe values", async () => {
    const fake = new FakeExec(() =>
      stdout("https://github.com/dtun/cafe-listo/issues/101\n"),
    );
    const url = await tracker(fake).create({
      title: "--help; rm -rf ~",
      body: "## Problem\n$(whoami) `id`",
      labels: ["feedback", "needs-triage"],
    });

    expect(url).toBe("https://github.com/dtun/cafe-listo/issues/101");
    expect(fake.last.args).toEqual([
      "issue",
      "create",
      "--repo=dtun/cafe-listo",
      "--title=--help; rm -rf ~",
      "--body-file=-",
      "--label=feedback",
      "--label=needs-triage",
    ]);
    expect(fake.last.input).toBe("## Problem\n$(whoami) `id`");
    expect(fake.last.env).toMatchObject({ GH_PROMPT_DISABLED: "1" });
  });

  it("comments with the body on stdin", async () => {
    const fake = new FakeExec(() =>
      stdout("https://github.com/dtun/cafe-listo/issues/12#issuecomment-9\n"),
    );
    await tracker(fake).comment(12, "New feedback");
    expect(fake.last.args).toEqual([
      "issue",
      "comment",
      "12",
      "--repo=dtun/cafe-listo",
      "--body-file=-",
    ]);
    expect(fake.last.input).toBe("New feedback");
  });

  it("refuses a bad issue number without calling gh", async () => {
    const fake = new FakeExec();
    await expect(tracker(fake).comment(0, "x")).rejects.toThrow(
      /bad issue number/,
    );
    expect(fake.calls).toHaveLength(0);
  });

  it("fails when gh prints no URL", async () => {
    const fake = new FakeExec(() => stdout("Creating issue...\n"));
    await expect(
      tracker(fake).create({ title: "t", body: "b", labels: [] }),
    ).rejects.toThrow(/did not return a URL/);
  });

  it("surfaces gh's stderr", async () => {
    const fake = new FakeExec(() => {
      throw new ExecError("exit 1", 1, "HTTP 401: Bad credentials", false);
    });
    await expect(tracker(fake).listOpen(1)).rejects.toThrow(/Bad credentials/);
  });

  it("refuses a malformed repo", () => {
    expect(() => new GhIssueTracker(new FakeExec().exec, "--repo=x")).toThrow(
      /owner\/name/,
    );
  });
});
