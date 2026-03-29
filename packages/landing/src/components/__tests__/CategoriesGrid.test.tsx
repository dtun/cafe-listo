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

  it("renders the emoji for each category", () => {
    render(<CategoriesGrid />);
    for (const category of CATEGORIES) {
      expect(screen.getByText(category.emoji)).toBeInTheDocument();
    }
  });

  it("renders the item count per category", () => {
    render(<CategoriesGrid />);
    for (const category of CATEGORIES) {
      const count = getItemsByCategory(category.id).length;
      expect(
        screen.getByText(new RegExp(`${count} item`)),
      ).toBeInTheDocument();
    }
  });
});
