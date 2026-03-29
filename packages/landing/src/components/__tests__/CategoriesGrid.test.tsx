import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CATEGORIES, getItemsByCategory } from "@cafe-listo/shared";
import { CategoriesGrid } from "../CategoriesGrid";

describe("CategoriesGrid", () => {
  it("renders a section heading", () => {
    render(<CategoriesGrid />);
    expect(
      screen.getByRole("heading", { name: /categories/i }),
    ).toBeInTheDocument();
  });

  it("renders all 8 category labels", () => {
    render(<CategoriesGrid />);
    for (const category of CATEGORIES) {
      expect(screen.getByText(category.label)).toBeInTheDocument();
    }
  });

  it("does not render emojis", () => {
    render(<CategoriesGrid />);
    for (const category of CATEGORIES) {
      expect(screen.queryByText(category.emoji)).not.toBeInTheDocument();
    }
  });

  it("renders the correct total of item count labels", () => {
    render(<CategoriesGrid />);
    const itemLabels = screen.getAllByText(/\d+ items?/);
    expect(itemLabels).toHaveLength(CATEGORIES.length);
  });

  it("displays accurate item counts from shared data", () => {
    render(<CategoriesGrid />);
    for (const category of CATEGORIES) {
      const count = getItemsByCategory(category.id).length;
      const card = screen.getByText(category.label).closest("div")!;
      expect(card).toHaveTextContent(`${count} items`);
    }
  });
});
