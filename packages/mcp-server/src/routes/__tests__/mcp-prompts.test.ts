import { describe, expect, it } from "vitest";
import {
  buildMcpPromptList,
  buildMcpResourceList,
  SOURCES,
} from "@cafe-listo/shared";
import { createTestApp, rpc } from "../../__tests__/fakes/test-app";

async function send(method: string, params: Record<string, unknown> = {}) {
  const { app } = createTestApp();
  const res = await app.fetch(rpc(method, params));
  expect(res.status).toBe(200);
  return res.json();
}

describe("initialize", () => {
  it("declares the prompts and resources capabilities", async () => {
    const body = await send("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0.0.0" },
    });

    expect(body.result.capabilities.prompts).toBeDefined();
    expect(body.result.capabilities.resources).toBeDefined();
  });
});

describe("prompts/list", () => {
  it("lists prep_my_tote with an optional location argument", async () => {
    const body = await send("prompts/list");

    expect(body.result.prompts).toEqual(buildMcpPromptList());
    expect(body.result.prompts).toEqual([
      expect.objectContaining({
        name: "prep_my_tote",
        arguments: [
          expect.objectContaining({ name: "location", required: false }),
        ],
      }),
    ]);
  });
});

describe("prompts/get", () => {
  it("returns one user message that walks the prep flow", async () => {
    const body = await send("prompts/get", { name: "prep_my_tote" });

    const { messages } = body.result;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content.type).toBe("text");
    const text: string = messages[0].content.text;
    for (const tool of [
      "get_household",
      "set_household",
      "build_shopping_list",
      "update_items",
    ]) {
      expect(text).toContain(tool);
    }
    expect(text).toMatch(/street address/);
  });

  it("puts a given state or ZIP into the message", async () => {
    const byState = await send("prompts/get", {
      name: "prep_my_tote",
      arguments: { location: "az" },
    });
    const byZip = await send("prompts/get", {
      name: "prep_my_tote",
      arguments: { location: "85201" },
    });

    expect(byState.result.messages[0].content.text).toContain("I'm in AZ");
    expect(byZip.result.messages[0].content.text).toContain("my ZIP is 85201");
  });

  it("returns invalid params for an unknown prompt", async () => {
    const body = await send("prompts/get", { name: "prep_my_bunker" });

    expect(body.result).toBeUndefined();
    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toContain("Unknown prompt: prep_my_bunker");
  });

  it.each([
    ["a street address", { location: "123 Main St, Mesa AZ" }],
    ["an unknown state", { location: "ZZ" }],
    ["an unknown argument", { address: "123 Main St" }],
  ])("returns invalid params for %s", async (_label, args) => {
    const body = await send("prompts/get", {
      name: "prep_my_tote",
      arguments: args,
    });

    expect(body.result).toBeUndefined();
    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toContain("Invalid arguments for prep_my_tote");
  });
});

describe("resources/list", () => {
  it("lists the sources bibliography", async () => {
    const body = await send("resources/list");

    expect(body.result.resources).toEqual(buildMcpResourceList());
    expect(body.result.resources).toEqual([
      expect.objectContaining({
        uri: "cafe-listo://sources",
        mimeType: "application/json",
      }),
    ]);
  });
});

describe("resources/read", () => {
  it("returns every source as JSON", async () => {
    const body = await send("resources/read", {
      uri: "cafe-listo://sources",
    });

    const { contents } = body.result;
    expect(contents).toHaveLength(1);
    expect(contents[0].uri).toBe("cafe-listo://sources");
    expect(contents[0].mimeType).toBe("application/json");
    expect(JSON.parse(contents[0].text)).toEqual({ sources: SOURCES });
  });

  it("returns resource not found for an unknown uri", async () => {
    const body = await send("resources/read", { uri: "cafe-listo://nope" });

    expect(body.result).toBeUndefined();
    expect(body.error.code).toBe(-32002);
    expect(body.error.message).toContain(
      "Resource not found: cafe-listo://nope",
    );
    expect(body.error.data).toEqual({ uri: "cafe-listo://nope" });
  });
});
