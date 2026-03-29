import { render, fireEvent } from "@testing-library/react-native";
import { PrepItemRow } from "../PrepItemRow";
import { PrepItem } from "@cafe-listo/shared";

const essentialItem: PrepItem = {
  id: "water-1",
  name: "Drinking water",
  categoryId: "water",
  essential: true,
  quantity: "1 gallon per person per day",
  regionNote: "Desert climate demands extra water",
};

const optionalItem: PrepItem = {
  id: "water-3",
  name: "Portable water filter",
  categoryId: "water",
  essential: false,
  quantity: "1",
  regionNote: null,
};

describe("PrepItemRow", () => {
  test("renders item name and quantity", () => {
    const { getByText } = render(
      <PrepItemRow item={essentialItem} checked={false} onToggle={jest.fn()} />,
    );
    expect(getByText("Drinking water")).toBeTruthy();
    expect(getByText("1 gallon per person per day")).toBeTruthy();
  });

  test("shows Essential badge when essential", () => {
    const { getByText } = render(
      <PrepItemRow item={essentialItem} checked={false} onToggle={jest.fn()} />,
    );
    expect(getByText("Essential")).toBeTruthy();
  });

  test("does not show Essential badge when optional", () => {
    const { queryByText } = render(
      <PrepItemRow item={optionalItem} checked={false} onToggle={jest.fn()} />,
    );
    expect(queryByText("Essential")).toBeNull();
  });

  test("shows region note when present", () => {
    const { getByText } = render(
      <PrepItemRow item={essentialItem} checked={false} onToggle={jest.fn()} />,
    );
    expect(getByText("Desert climate demands extra water")).toBeTruthy();
  });

  test("does not show region note when null", () => {
    const { queryByTestId } = render(
      <PrepItemRow item={optionalItem} checked={false} onToggle={jest.fn()} />,
    );
    expect(queryByTestId("note-water-3")).toBeNull();
  });

  test("calls onToggle when pressed", () => {
    const onToggle = jest.fn();
    const { getByTestId } = render(
      <PrepItemRow item={essentialItem} checked={false} onToggle={onToggle} />,
    );
    fireEvent.press(getByTestId("prep-item-water-1"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test("displays checked state", () => {
    const { getByTestId } = render(
      <PrepItemRow item={essentialItem} checked={true} onToggle={jest.fn()} />,
    );
    expect(getByTestId("checkbox-water-1").props.children).toBe("☑");
  });

  test("displays unchecked state", () => {
    const { getByTestId } = render(
      <PrepItemRow item={essentialItem} checked={false} onToggle={jest.fn()} />,
    );
    expect(getByTestId("checkbox-water-1").props.children).toBe("☐");
  });
});
