import type { Exec, ExecRequest, ExecResult } from "../../adapters/exec";

type Handler = (request: ExecRequest) => ExecResult | Promise<ExecResult>;

/** Records every request and answers with a scripted handler. */
export class FakeExec {
  readonly calls: ExecRequest[] = [];

  constructor(private handler: Handler = () => ({ stdout: "", stderr: "" })) {}

  respond(handler: Handler): this {
    this.handler = handler;
    return this;
  }

  readonly exec: Exec = async (request) => {
    this.calls.push(structuredClone(request));
    return this.handler(request);
  };

  get last(): ExecRequest {
    const call = this.calls.at(-1);
    if (!call) throw new Error("no exec calls");
    return call;
  }
}

export const stdout = (text: string): ExecResult => ({
  stdout: text,
  stderr: "",
});
