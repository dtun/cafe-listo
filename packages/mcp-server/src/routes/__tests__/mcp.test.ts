import { describe, expect, it } from "vitest";
import {
  buildMcpToolList,
  mcpServerInstructions,
  PREP_ITEMS,
} from "@cafe-listo/shared";
import { createApp } from "../../app";
import { callTool, createTestApp, rpc } from "../../__tests__/fakes/test-app";

describe("POST /mcp auth", () => {
  it("returns 401 with resource metadata when no token is sent", async () => {
    const { app } = createTestApp();

    const res = await app.fetch(rpc("tools/list", {}, { token: null }));

    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe(
      'Bearer resource_metadata="http://localhost/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it("returns 401 for an invalid token", async () => {
    const { app } = createTestApp();

    const res = await app.fetch(rpc("tools/list", {}, { token: "garbage" }));

    expect(res.status).toBe(401);
  });

  it("uses forwarded proto and host in the resource metadata URL", async () => {
    const { app } = createTestApp();
    const req = rpc("tools/list", {}, { token: null });
    req.headers.set("X-Forwarded-Proto", "https");
    req.headers.set("X-Forwarded-Host", "mcp.example.com");

    const res = await app.fetch(req);

    expect(res.headers.get("WWW-Authenticate")).toBe(
      'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it("accepts the bearer scheme case-insensitively", async () => {
    const { app } = createTestApp();
    const req = rpc("tools/list");
    req.headers.set("Authorization", "bearer token-for:alice");

    const res = await app.fetch(req);

    expect(res.status).toBe(200);
  });

  it("rejects other auth schemes", async () => {
    const { app } = createTestApp();
    const req = rpc("tools/list");
    req.headers.set("Authorization", "Basic token-for:alice");

    const res = await app.fetch(req);

    expect(res.status).toBe(401);
  });

  it("is not mounted when MCP is not configured", async () => {
    const app = createApp();

    const res = await app.fetch(rpc("tools/list"));

    expect(res.status).toBe(404);
  });
});

describe("POST /mcp protocol", () => {
  it("answers initialize with a JSON response", async () => {
    const { app } = createTestApp();

    const res = await app.fetch(
      rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "0.0.0" },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe("cafe-listo");
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.instructions).toBe(mcpServerInstructions);
    expect(body.result.instructions).toContain("submit_feedback");
  });

  it("returns 400 for malformed JSON", async () => {
    const { app } = createTestApp();

    const res = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          Authorization: "Bearer token-for:alice",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: "{not json",
      }),
    );

    expect(res.status).toBe(400);
  });

  it("lists tools from the shared registry", async () => {
    const { app } = createTestApp();

    const res = await app.fetch(rpc("tools/list"));

    const body = await res.json();
    expect(body.result.tools).toEqual(buildMcpToolList());
    expect(
      body.result.tools.find(
        (t: { name: string }) => t.name === "submit_feedback",
      )?.annotations,
    ).toEqual({
      title: "Send feedback",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });
  });
});

describe("GET and DELETE /mcp", () => {
  it.each(["GET", "DELETE"])(
    "%s returns 405 with Allow: POST (stateless, no SSE stream or sessions)",
    async (method) => {
      const { app } = createTestApp();

      const res = await app.fetch(
        new Request("http://localhost/mcp", {
          method,
          headers: {
            Authorization: "Bearer token-for:alice",
            Accept: "text/event-stream",
          },
        }),
      );

      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST");
      expect(res.headers.get("Content-Type")).not.toContain(
        "text/event-stream",
      );
    },
  );

  it("still challenges an unauthenticated GET so clients can discover OAuth", async () => {
    const { app } = createTestApp();

    const res = await app.fetch(
      new Request("http://localhost/mcp", { method: "GET" }),
    );

    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("resource_metadata");
  });
});

describe("tools/call", () => {
  it("list_categories returns categories", async () => {
    const { app } = createTestApp();

    const result = await callTool(app, "list_categories");

    expect(result.isError).toBe(false);
    expect(result.json()).toContainEqual({
      id: "water",
      label: "Water & Hydration",
      emoji: "💧",
    });
  });

  it("list_items returns snake_case items filtered by category", async () => {
    const { app } = createTestApp();

    const result = await callTool(app, "list_items", {
      category_id: "water",
      essential_only: true,
    });

    const items = result.json();
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        category_id: "water",
        essential: true,
        region_note: expect.anything(),
      }),
    );
  });

  it("set_item_done then get_checklist reflects progress", async () => {
    const { app } = createTestApp();

    const set = await callTool(app, "set_item_done", {
      item_id: "water-1",
      done: true,
    });
    expect(set.json()).toEqual({ item_id: "water-1", done: true });

    const checklist = (await callTool(app, "get_checklist")).json();
    expect(checklist.progress).toEqual({
      done: 1,
      total: PREP_ITEMS.length,
      percent: Math.round((1 / PREP_ITEMS.length) * 100),
    });
    expect(
      checklist.items.find((i: { id: string }) => i.id === "water-1").done,
    ).toBe(true);
  });

  it("reset_checklist clears progress", async () => {
    const { app } = createTestApp();
    await callTool(app, "set_item_done", { item_id: "water-1", done: true });

    const reset = await callTool(app, "reset_checklist");

    expect(reset.json()).toEqual({ reset: true });
    expect((await callTool(app, "get_checklist")).json().progress.done).toBe(0);
  });

  it("reports invalid arguments so the model can correct itself", async () => {
    const { app } = createTestApp();

    const result = await callTool(app, "set_item_done", {
      item_id: "water-1",
      done: "yes",
    });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(
      /^Error: Invalid arguments for set_item_done: done:/,
    );
  });

  it("reports an unknown item as not found", async () => {
    const { app } = createTestApp();

    const result = await callTool(app, "set_item_done", {
      item_id: "nope-1",
      done: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        isError: true,
        text: "Error: Item not found: nope-1",
      }),
    );
  });

  it("reports an unknown tool", async () => {
    const { app } = createTestApp();

    const result = await callTool(app, "drop_tables");

    expect(result.isError).toBe(true);
    expect(result.text).toBe("Error: Unknown tool: drop_tables");
  });

  it("isolates users end to end", async () => {
    const { app } = createTestApp();
    await callTool(
      app,
      "set_item_done",
      { item_id: "water-1", done: true },
      "token-for:alice",
    );

    const bob = (
      await callTool(app, "get_checklist", {}, "token-for:bob")
    ).json();

    expect(bob.progress.done).toBe(0);
  });
});

describe("submit_feedback", () => {
  it("persists feedback owned by the verified caller, never by an argument", async () => {
    const { app, feedback } = createTestApp();

    const result = await callTool(
      app,
      "submit_feedback",
      {
        kind: "gap",
        summary: "No pet supplies in the catalog",
        user_quote: "what about my dog?",
        user_id: "bob",
      },
      "token-for:alice",
    );

    expect(result.isError).toBe(false);
    const body = result.json();
    expect(body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      received_at: "2026-01-01T00:00:00.000Z",
    });
    expect(feedback.rows).toEqual([
      expect.objectContaining({
        id: body.id,
        userId: "alice",
        kind: "gap",
        summary: "No pet supplies in the catalog",
        userQuote: "what about my dog?",
      }),
    ]);
  });

  it("rejects an unknown kind without storing anything", async () => {
    const { app, feedback } = createTestApp();

    const result = await callTool(app, "submit_feedback", {
      kind: "rant",
      summary: "x",
    });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(
      /^Error: Invalid arguments for submit_feedback: kind:/,
    );
    expect(feedback.rows).toEqual([]);
  });
});

describe("household tools", () => {
  it("get_household returns null before anything is saved", async () => {
    const { app } = createTestApp();

    const result = await callTool(app, "get_household");

    expect(result.isError).toBe(false);
    expect(result.json()).toEqual({ profile: null });
  });

  it("set_household saves from a ZIP and get_household reads it back", async () => {
    const { app, profiles } = createTestApp();

    const set = await callTool(app, "set_household", {
      zip: "85201-1234",
      adults: 2,
      pets: { dogs: 1 },
      medical: { needs: ["insulin (refrigerated)"] },
    });

    expect(set.isError).toBe(false);
    const expected = {
      profile: {
        state: "AZ",
        zip: "85201",
        region: { id: 9, name: expect.any(String) },
        household: {
          adults: 2,
          seniors: 0,
          children: { count: 0 },
          infants: 0,
          pets: { dogs: 1, cats: 0, other: 0 },
          medical: { needs: ["insulin (refrigerated)"], flags: [] },
          dietary: [],
          days: 3,
        },
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    };
    expect(set.json()).toEqual(expected);
    expect((await callTool(app, "get_household")).json()).toEqual(expected);
    expect(await profiles.get("alice")).toMatchObject({ state: "AZ" });
  });

  it("set_household applies partial updates", async () => {
    const { app } = createTestApp();
    await callTool(app, "set_household", { state: "AZ", adults: 2, days: 7 });

    const result = await callTool(app, "set_household", { infants: 1 });

    expect(result.json().profile.household).toMatchObject({
      adults: 2,
      infants: 1,
      days: 7,
    });
  });

  it("validates set_household arguments through the registry", async () => {
    const { app, profiles } = createTestApp();

    const result = await callTool(app, "set_household", {
      state: "Arizona",
      adults: -1,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/^Error: Invalid arguments for set_household:/);
    expect(result.text).toMatch(/state: state must be a two-letter code/);
    expect(result.text).toMatch(/adults:/);
    expect(await profiles.get("alice")).toBeNull();
  });

  it("reports an unknown state so the model asks the user", async () => {
    const { app } = createTestApp();

    const result = await callTool(app, "set_household", {
      state: "ZZ",
      adults: 1,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/^Error: Unknown state "ZZ"/);
  });

  it("ignores a user_id argument and isolates users", async () => {
    const { app, profiles } = createTestApp();

    await callTool(
      app,
      "set_household",
      { state: "AZ", adults: 1, user_id: "bob" },
      "token-for:alice",
    );

    expect(await profiles.get("bob")).toBeNull();
    expect(
      (await callTool(app, "get_household", {}, "token-for:bob")).json(),
    ).toEqual({ profile: null });
  });
});

describe("CORS on /mcp", () => {
  it("allows claude.ai", async () => {
    const { app } = createTestApp();

    const res = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "OPTIONS",
        headers: {
          Origin: "https://claude.ai",
          "Access-Control-Request-Method": "POST",
        },
      }),
    );

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://claude.ai",
    );
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
      "Mcp-Session-Id",
    );
  });

  it("allows requests without an Origin", async () => {
    const { app } = createTestApp();

    const res = await app.fetch(rpc("tools/list"));

    expect(res.status).toBe(200);
  });

  it("does not grant other origins", async () => {
    const { app } = createTestApp();

    const res = await app.fetch(
      rpc("tools/list", {}, { origin: "https://evil.example" }),
    );

    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
