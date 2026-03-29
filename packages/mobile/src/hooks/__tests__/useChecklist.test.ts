import { renderHook, act } from "@testing-library/react-native";
import { useChecklist } from "../useChecklist";
import { PREP_ITEMS } from "@cafe-listo/shared";

describe("useChecklist", () => {
  test("initial state has all items unchecked", () => {
    const { result } = renderHook(() => useChecklist());
    const allUnchecked = Object.values(result.current.state).every(
      (v) => v === false,
    );
    expect(allUnchecked).toBe(true);
  });

  test("toggle flips a single item", () => {
    const { result } = renderHook(() => useChecklist());
    const itemId = PREP_ITEMS[0].id;

    act(() => {
      result.current.toggle(itemId);
    });

    expect(result.current.state[itemId]).toBe(true);
  });

  test("toggle twice returns to unchecked", () => {
    const { result } = renderHook(() => useChecklist());
    const itemId = PREP_ITEMS[0].id;

    act(() => {
      result.current.toggle(itemId);
    });
    act(() => {
      result.current.toggle(itemId);
    });

    expect(result.current.state[itemId]).toBe(false);
  });

  test("reset restores all to unchecked", () => {
    const { result } = renderHook(() => useChecklist());

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

  test("progress reflects correct counts", () => {
    const { result } = renderHook(() => useChecklist());

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
