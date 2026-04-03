import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { ChecklistScreen } from "../ChecklistScreen";
import { CATEGORIES, PREP_ITEMS } from "@cafe-listo/shared";

// Mock expo-sqlite so the persister doesn't try to use a real database
jest.mock("expo-sqlite", () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    getAllSync: jest.fn(() => []),
    runSync: jest.fn(),
  })),
  addDatabaseChangeListener: jest.fn(() => ({ remove: jest.fn() })),
}));

describe("ChecklistScreen", () => {
  test("shows loading indicator while store is hydrating", () => {
    const { getByTestId } = render(<ChecklistScreen />);
    expect(getByTestId("loading-indicator")).toBeTruthy();
  });

  test("renders all 8 category headers", async () => {
    const { getByText, queryByTestId } = render(<ChecklistScreen />);
    await waitFor(() => {
      expect(queryByTestId("loading-indicator")).toBeNull();
    });
    for (const category of CATEGORIES) {
      expect(getByText(new RegExp(category.label))).toBeTruthy();
    }
  });

  test("renders all items", async () => {
    const { getByText, queryByTestId } = render(<ChecklistScreen />);
    await waitFor(() => {
      expect(queryByTestId("loading-indicator")).toBeNull();
    });
    for (const item of PREP_ITEMS) {
      expect(getByText(item.name)).toBeTruthy();
    }
  });

  test("tapping an item toggles its checked state", async () => {
    const firstItem = PREP_ITEMS[0];
    const { getByTestId, queryByTestId } = render(<ChecklistScreen />);

    await waitFor(() => {
      expect(queryByTestId("loading-indicator")).toBeNull();
    });

    expect(getByTestId(`checkbox-${firstItem.id}`).props.children).toBe("☐");

    fireEvent.press(getByTestId(`prep-item-${firstItem.id}`));

    expect(getByTestId(`checkbox-${firstItem.id}`).props.children).toBe("☑");
  });

  test("overall progress updates after toggling", async () => {
    const { getByText, getByTestId, queryByTestId } = render(
      <ChecklistScreen />,
    );

    await waitFor(() => {
      expect(queryByTestId("loading-indicator")).toBeNull();
    });

    expect(getByText(`0 / ${PREP_ITEMS.length} items ready`)).toBeTruthy();

    fireEvent.press(getByTestId(`prep-item-${PREP_ITEMS[0].id}`));

    expect(getByText(`1 / ${PREP_ITEMS.length} items ready`)).toBeTruthy();
  });
});
