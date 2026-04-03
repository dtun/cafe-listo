import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useChecklist } from "../useChecklist";
import { PREP_ITEMS } from "@cafe-listo/shared";
import { createChecklistStore } from "../../store";

// Mock expo-sqlite so the persister doesn't try to use a real database
jest.mock("expo-sqlite", () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    getAllSync: jest.fn(() => []),
    runSync: jest.fn(),
  })),
  addDatabaseChangeListener: jest.fn(() => ({ remove: jest.fn() })),
}));

describe("useChecklist", () => {
  test("initial state has all items unchecked", async () => {
    const store = createChecklistStore();
    const { result } = renderHook(() => useChecklist(store));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const allUnchecked = Object.values(result.current.state).every(
      (v) => v === false,
    );
    expect(allUnchecked).toBe(true);
  });

  test("toggle flips a single item", async () => {
    const store = createChecklistStore();
    const { result } = renderHook(() => useChecklist(store));
    const itemId = PREP_ITEMS[0].id;

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.toggle(itemId);
    });

    expect(result.current.state[itemId]).toBe(true);
  });

  test("toggle twice returns to unchecked", async () => {
    const store = createChecklistStore();
    const { result } = renderHook(() => useChecklist(store));
    const itemId = PREP_ITEMS[0].id;

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.toggle(itemId);
    });
    act(() => {
      result.current.toggle(itemId);
    });

    expect(result.current.state[itemId]).toBe(false);
  });

  test("reset restores all to unchecked", async () => {
    const store = createChecklistStore();
    const { result } = renderHook(() => useChecklist(store));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.toggle(PREP_ITEMS[0].id);
      result.current.toggle(PREP_ITEMS[1].id);
    });
    act(() => {
      result.current.reset();
    });

    const allUnchecked = Object.values(result.current.state).every(
      (v) => v === false,
    );
    expect(allUnchecked).toBe(true);
  });

  test("progress reflects correct counts", async () => {
    const store = createChecklistStore();
    const { result } = renderHook(() => useChecklist(store));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.progress).toEqual({
      checked: 0,
      total: PREP_ITEMS.length,
    });

    act(() => {
      result.current.toggle(PREP_ITEMS[0].id);
    });

    expect(result.current.progress).toEqual({
      checked: 1,
      total: PREP_ITEMS.length,
    });
  });
});

describe("useChecklist persistence", () => {
  test("toggle persists state to the store", async () => {
    const store = createChecklistStore();
    const { result } = renderHook(() => useChecklist(store));
    const itemId = PREP_ITEMS[0].id;

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.toggle(itemId);
    });

    // The TinyBase store should reflect the toggled state
    expect(store.getCell("checklist", itemId, "done")).toBe(true);
  });

  test("reset persists all-unchecked state to the store", async () => {
    const store = createChecklistStore();
    const { result } = renderHook(() => useChecklist(store));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.toggle(PREP_ITEMS[0].id);
      result.current.toggle(PREP_ITEMS[1].id);
    });
    act(() => {
      result.current.reset();
    });

    for (const item of PREP_ITEMS) {
      expect(store.getCell("checklist", item.id, "done")).toBe(false);
    }
  });

  test("loading starts true then becomes false", async () => {
    const store = createChecklistStore();
    const { result } = renderHook(() => useChecklist(store));

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  test("reflects pre-existing store state", async () => {
    const store = createChecklistStore();
    const itemId = PREP_ITEMS[0].id;

    // Pre-set a checked item in the store (simulating loaded persisted data)
    store.setCell("checklist", itemId, "done", true);

    const { result } = renderHook(() => useChecklist(store));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.state[itemId]).toBe(true);
    expect(result.current.progress.checked).toBe(1);
  });
});
