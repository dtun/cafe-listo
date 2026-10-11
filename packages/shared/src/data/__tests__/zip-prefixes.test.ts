import { STATE_CODES } from "../fema-regions";
import { regionForZip, stateForZip } from "../zip-prefixes";

describe("stateForZip", () => {
  test.each([
    ["85201", "AZ"],
    ["10001", "NY"],
    ["00501", "NY"],
    ["33101", "FL"],
    ["99501", "AK"],
    ["00901", "PR"],
    ["00802", "VI"],
    ["20500", "DC"],
    ["02108", "MA"],
    ["05501", "MA"],
    ["73301", "TX"],
    ["73102", "OK"],
    ["88510", "TX"],
    ["90210", "CA"],
    ["96813", "HI"],
    ["96799", "AS"],
    ["96910", "GU"],
    ["96950", "MP"],
    ["96960", "MH"],
    ["96941", "FM"],
  ])("%s is in %s", (zip, state) => {
    expect(stateForZip(zip)).toBe(state);
  });

  test("accepts ZIP+4 with or without a hyphen", () => {
    expect(stateForZip("85201-1234")).toBe("AZ");
    expect(stateForZip("852011234")).toBe("AZ");
  });

  test.each([
    "",
    "8520",
    "abcde",
    "852011",
    "09001",
    "34001",
    "96201",
    "96939",
  ])("returns undefined for %p", (zip) => {
    expect(stateForZip(zip)).toBeUndefined();
  });

  test("every state and territory is reachable from some ZIP", () => {
    const seen = new Set<string>();
    for (let n = 0; n < 1000; n++) {
      const state = stateForZip(`${String(n).padStart(3, "0")}00`);
      if (state) seen.add(state);
    }
    for (const zip of ["96799", "96950", "96960", "96941"]) {
      seen.add(stateForZip(zip) as string);
    }
    expect([...seen].sort()).toEqual([...STATE_CODES].sort());
  });
});

describe("regionForZip", () => {
  test.each([
    ["85201", 9],
    ["33101", 4],
    ["10001", 2],
    ["99501", 10],
    ["00901", 2],
    ["96910", 9],
    ["60601", 5],
    ["80202", 8],
  ])("%s is in Region %i", (zip, id) => {
    expect(regionForZip(zip)?.id).toBe(id);
  });

  test("returns undefined for a military ZIP", () => {
    expect(regionForZip("09001")).toBeUndefined();
  });
});
