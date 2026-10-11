import { SOURCES, getSource } from "../sources";

describe("sources", () => {
  test("ids are unique", () => {
    const ids = SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("ids are kebab-case", () => {
    for (const source of SOURCES) {
      expect(source.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  test("urls are https", () => {
    for (const source of SOURCES) {
      expect(new URL(source.url).protocol).toBe("https:");
    }
  });

  test("accessed dates are ISO dates or null", () => {
    for (const source of SOURCES) {
      if (source.accessed !== null) {
        expect(source.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  test("covers all ten FEMA regions", () => {
    for (let n = 1; n <= 10; n++) {
      expect(SOURCES.some((s) => s.id === `fema-region-${n}`)).toBe(true);
    }
  });

  test("getSource returns the matching source", () => {
    expect(getSource("ready-kit").url).toBe("https://www.ready.gov/kit");
  });
});
