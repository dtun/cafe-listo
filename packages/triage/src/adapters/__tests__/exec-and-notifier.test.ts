import { describe, expect, it } from "vitest";
import { FakeExec } from "../../__tests__/fakes/fake-exec";
import { ExecError, nodeExec } from "../exec";
import { MacNotifier, notifierFor, silentNotifier } from "../notifier";

describe("nodeExec", () => {
  it("passes args verbatim, without a shell, and feeds stdin", async () => {
    const { stdout } = await nodeExec({
      file: process.execPath,
      args: [
        "-e",
        "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify([process.argv[1],s])))",
        "$(whoami); `id`",
      ],
      input: "body with 'quotes'",
    });
    expect(JSON.parse(stdout)).toEqual([
      "$(whoami); `id`",
      "body with 'quotes'",
    ]);
  });

  it("rejects with stderr on a non-zero exit", async () => {
    await expect(
      nodeExec({
        file: process.execPath,
        args: ["-e", "console.error('boom'); process.exit(3)"],
      }),
    ).rejects.toMatchObject({ exitCode: 3, timedOut: false, stderr: "boom\n" });
  });

  it("kills and flags a timeout", async () => {
    const error = await nodeExec({
      file: process.execPath,
      args: ["-e", "setTimeout(() => {}, 10000)"],
      timeoutMs: 100,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ExecError);
    expect(error.timedOut).toBe(true);
  });

  it("names a missing binary", async () => {
    await expect(
      nodeExec({ file: "definitely-not-a-binary-xyz", args: [] }),
    ).rejects.toThrow(/not found on PATH/);
  });
});

describe("notifier", () => {
  it("passes the message as an argv item, not script text", async () => {
    const fake = new FakeExec();
    await new MacNotifier(fake.exec).notify('3 triaged" & do shell script "x');
    expect(fake.last.file).toBe("osascript");
    expect(fake.last.args.at(-1)).toBe('3 triaged" & do shell script "x');
    expect(fake.last.args.slice(0, -1).join(" ")).not.toContain("triaged");
  });

  it("ignores failures", async () => {
    const fake = new FakeExec(() => {
      throw new Error("no osascript");
    });
    await expect(
      new MacNotifier(fake.exec).notify("x"),
    ).resolves.toBeUndefined();
  });

  it("only notifies on macOS", () => {
    const exec = new FakeExec().exec;
    expect(notifierFor("darwin", exec)).toBeInstanceOf(MacNotifier);
    expect(notifierFor("linux", exec)).toBe(silentNotifier);
  });
});
