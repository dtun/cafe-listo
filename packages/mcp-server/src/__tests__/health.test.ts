import { describe, expect, it } from "vitest";
import { createApp } from "../app";

describe("GET /health", () => {
  it("returns ok with a timestamp", async () => {
    const app = createApp();

    const res = await app.fetch(new Request("http://localhost/health"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(new Date(body.timestamp).toString()).not.toBe("Invalid Date");
  });
});

describe("unhandled errors", () => {
  it("returns a generic 500 without leaking details", async () => {
    const app = createApp();
    app.get("/boom", () => {
      throw new Error("db password is hunter2");
    });

    const res = await app.fetch(new Request("http://localhost/boom"));

    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("hunter2");
  });
});
