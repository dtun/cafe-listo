// Guards #38/#41: the household types and `scale` must load without zod, so
// exporting them from the root index adds no runtime deps to mobile/landing.
jest.mock("zod", () => {
  throw new Error("zod must not be loaded by the household rules");
});

describe("household rules", () => {
  it("load without zod", async () => {
    await expect(
      jest.isolateModulesAsync(async () => {
        await import("../household/types");
        await import("../household/scale");
      }),
    ).resolves.toBeUndefined();
  });

  it("would catch a zod import (the schema module needs it)", async () => {
    await expect(
      jest.isolateModulesAsync(async () => {
        await import("../household/schema");
      }),
    ).rejects.toThrow(/zod must not be loaded/);
  });
});
