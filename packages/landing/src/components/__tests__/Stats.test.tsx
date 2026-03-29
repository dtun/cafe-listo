import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CATEGORIES, PREP_ITEMS } from "@cafe-listo/shared";
import { Stats } from "../Stats";

describe("Stats", () => {
  it("renders the total item count", () => {
    render(<Stats />);
    expect(
      screen.getByText(new RegExp(String(PREP_ITEMS.length))),
    ).toBeInTheDocument();
  });

  it("renders the category count", () => {
    render(<Stats />);
    expect(
      screen.getByText(new RegExp(String(CATEGORIES.length))),
    ).toBeInTheDocument();
  });

  it("mentions FEMA region readiness", () => {
    render(<Stats />);
    expect(screen.getByText(/FEMA/i)).toBeInTheDocument();
  });
});
