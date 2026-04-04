import { render, waitFor } from "@testing-library/react-native";

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    getAllSync: jest.fn(() => []),
    runSync: jest.fn(),
  })),
  addDatabaseChangeListener: jest.fn(() => ({ remove: jest.fn() })),
}));

import HomeRoute from "../index";

describe("HomeRoute (index)", () => {
  test("renders the ChecklistScreen content", async () => {
    const { getByTestId, queryByTestId } = render(<HomeRoute />);
    await waitFor(() => {
      expect(queryByTestId("loading-indicator")).toBeNull();
    });
    expect(getByTestId("checklist-screen")).toBeTruthy();
  });
});
