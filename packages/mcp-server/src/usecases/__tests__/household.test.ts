import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../__tests__/fakes/fixed-clock";
import { InMemoryProfileRepository } from "../../__tests__/fakes/in-memory-profile-repository";
import { GetHousehold } from "../get-household";
import { SetHousehold, type SetHouseholdInput } from "../set-household";

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const NOW = "2026-03-01T00:00:00.000Z";

describe("household use cases", () => {
  let repo: InMemoryProfileRepository;
  let getHousehold: GetHousehold;
  let setHousehold: SetHousehold;

  const set = (
    input: Omit<SetHouseholdInput, "userId" | "household"> & {
      household?: SetHouseholdInput["household"];
      userId?: string;
    },
  ) => setHousehold.execute({ userId: ALICE, household: {}, ...input });

  beforeEach(() => {
    repo = new InMemoryProfileRepository();
    getHousehold = new GetHousehold(repo);
    setHousehold = new SetHousehold(repo, fixedClock(NOW));
  });

  it("returns null before anything is saved", async () => {
    expect(await getHousehold.execute({ userId: ALICE })).toEqual({
      ok: true,
      data: null,
    });
  });

  it("saves a first profile from a state, deriving the region and filling defaults", async () => {
    const result = await set({ state: "az", household: { adults: 2 } });

    expect(result).toEqual({
      ok: true,
      data: {
        region: 9,
        state: "AZ",
        zip: null,
        household: {
          adults: 2,
          seniors: 0,
          children: { count: 0 },
          infants: 0,
          pets: { dogs: 0, cats: 0, other: 0 },
          medical: { needs: [], flags: [] },
          dietary: [],
          days: 3,
        },
        updatedAt: new Date(NOW),
      },
    });
    const stored = await getHousehold.execute({ userId: ALICE });
    expect(stored.ok && stored.data).toEqual(result.ok && result.data);
  });

  it("derives the state and region from a ZIP and keeps only five digits", async () => {
    const result = await set({ zip: "85201-1234", household: { adults: 1 } });

    expect(result.ok && result.data).toMatchObject({
      region: 9,
      state: "AZ",
      zip: "85201",
    });
  });

  it("applies partial updates and keeps everything else", async () => {
    await set({
      zip: "85201",
      household: { adults: 2, pets: { dogs: 1 }, days: 7 },
    });

    const result = await set({ household: { infants: 1, pets: { cats: 1 } } });

    expect(result.ok && result.data).toMatchObject({
      state: "AZ",
      zip: "85201",
      household: {
        adults: 2,
        infants: 1,
        pets: { dogs: 1, cats: 1, other: 0 },
        days: 7,
      },
    });
  });

  it("keeps a stored ZIP when the same state is sent again", async () => {
    await set({ zip: "85201", household: { adults: 1 } });

    const result = await set({ state: "AZ" });

    expect(result.ok && result.data.zip).toBe("85201");
  });

  it("drops a stored ZIP when the state changes", async () => {
    await set({ zip: "85201", household: { adults: 1 } });

    const result = await set({ state: "WA" });

    expect(result.ok && result.data).toMatchObject({
      region: 10,
      state: "WA",
      zip: null,
    });
  });

  it("rejects an unknown state with a hint to ask the user", async () => {
    const result = await set({ state: "ZZ", household: { adults: 1 } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("unprocessable");
    expect(result.error.message).toMatch(/Unknown state "ZZ"/);
    expect(result.error.message).toMatch(/ask the user/i);
    expect(await repo.get(ALICE)).toBeNull();
  });

  it("rejects an unknown ZIP with a hint to ask the user", async () => {
    const result = await set({ zip: "00000", household: { adults: 1 } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/Unknown ZIP code "00000"/);
    expect(result.error.message).toMatch(/ask the user/i);
  });

  it("rejects a ZIP from a different state than the one sent", async () => {
    const result = await set({
      state: "CA",
      zip: "85201",
      household: { adults: 1 },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/85201 is in AZ, not CA/);
  });

  it("asks for a location on the first save", async () => {
    const result = await set({ household: { adults: 1 } });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "unprocessable",
        message: expect.stringMatching(/Ask the user for their state or ZIP/),
      },
    });
  });

  it("asks who is in the household when nobody is", async () => {
    const result = await set({ state: "AZ" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/at least one person/);
    expect(result.error.message).toMatch(/rather than guessing/);
    expect(await repo.get(ALICE)).toBeNull();
  });

  it("validates the merged household with the household schema", async () => {
    await set({ state: "AZ", household: { adults: 1 } });

    const result = await set({
      household: { adults: 0, children: { count: 1, bands: { teen: 2 } } },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/children\.bands/);
    const stored = await repo.get(ALICE);
    expect(stored?.household.adults).toBe(1);
  });

  it("rejects an empty update", async () => {
    const result = await set({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/Nothing to update/);
  });

  it("is idempotent", async () => {
    const input = { state: "AZ", household: { adults: 2, pets: { dogs: 1 } } };
    const first = await set(input);
    const second = await set(input);

    expect(second).toEqual(first);
  });

  it("never shows one user's profile to another", async () => {
    await set({ zip: "85201", household: { adults: 2 } });

    expect(await getHousehold.execute({ userId: BOB })).toEqual({
      ok: true,
      data: null,
    });
  });
});
