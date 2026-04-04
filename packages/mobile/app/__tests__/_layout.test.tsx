import { render } from "@testing-library/react-native";

jest.mock("expo-router", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  return {
    Slot: () => <View testID="router-slot" />,
  };
});

jest.mock("expo-status-bar", () => ({
  StatusBar: () => null,
}));

import RootLayout from "../_layout";

describe("RootLayout", () => {
  test("renders the router slot for child routes", () => {
    const { getByTestId } = render(<RootLayout />);
    expect(getByTestId("router-slot")).toBeTruthy();
  });

  test("wraps content in SafeAreaView", () => {
    const { toJSON } = render(<RootLayout />);
    const tree = toJSON();
    expect(tree).not.toBeNull();
    expect((tree as { type: string }).type).toBe("RCTSafeAreaView");
  });
});
