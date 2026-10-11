import { SOURCES } from "../../data/sources";
import {
  buildMcpResourceList,
  readMcpResource,
  SOURCES_RESOURCE_URI,
} from "../resources";

describe("buildMcpResourceList", () => {
  it("lists the sources bibliography as JSON", () => {
    expect(buildMcpResourceList()).toEqual([
      expect.objectContaining({
        uri: "cafe-listo://sources",
        name: "sources",
        mimeType: "application/json",
      }),
    ]);
  });
});

describe("readMcpResource", () => {
  it("returns every source", () => {
    const contents = readMcpResource(SOURCES_RESOURCE_URI);

    expect(contents?.mimeType).toBe("application/json");
    expect(JSON.parse(contents?.text ?? "")).toEqual({ sources: SOURCES });
  });

  it("returns null for an unknown uri", () => {
    expect(readMcpResource("cafe-listo://nope")).toBeNull();
  });
});
