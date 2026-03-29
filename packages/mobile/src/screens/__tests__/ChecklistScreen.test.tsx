import { render, fireEvent } from "@testing-library/react-native";
import { ChecklistScreen } from "../ChecklistScreen";
import { CATEGORIES, PREP_ITEMS } from "@cafe-listo/shared";

describe("ChecklistScreen", () => {
  test("renders all 8 category headers", () => {
    const { getByText } = render(<ChecklistScreen />);
    for (const category of CATEGORIES) {
      expect(getByText(new RegExp(category.label))).toBeTruthy();
    }
  });

  test("renders all items", () => {
    const { getByText } = render(<ChecklistScreen />);
    for (const item of PREP_ITEMS) {
      expect(getByText(item.name)).toBeTruthy();
    }
  });

  test("tapping an item toggles its checked state", () => {
    const firstItem = PREP_ITEMS[0];
    const { getByTestId } = render(<ChecklistScreen />);

    expect(getByTestId(`checkbox-${firstItem.id}`).props.children).toBe("☐");

    fireEvent.press(getByTestId(`prep-item-${firstItem.id}`));

    expect(getByTestId(`checkbox-${firstItem.id}`).props.children).toBe("☑");
  });

  test("overall progress updates after toggling", () => {
    const { getByText, getByTestId } = render(<ChecklistScreen />);

    expect(getByText(`0 / ${PREP_ITEMS.length} items ready`)).toBeTruthy();

    fireEvent.press(getByTestId(`prep-item-${PREP_ITEMS[0].id}`));

    expect(getByText(`1 / ${PREP_ITEMS.length} items ready`)).toBeTruthy();
  });
});
