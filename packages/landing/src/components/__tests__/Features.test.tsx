import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Features } from "../Features";

describe("Features", () => {
  it("renders a section heading", () => {
    render(<Features />);
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });

  it("renders at least 4 feature headings", () => {
    render(<Features />);
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.length).toBeGreaterThanOrEqual(4);
  });

  it("renders a description for each feature", () => {
    render(<Features />);
    const headings = screen.getAllByRole("heading", { level: 3 });
    for (const heading of headings) {
      const card = heading.closest("div")!;
      const description = card.querySelector("p");
      expect(description).toBeInTheDocument();
      expect(description!.textContent!.length).toBeGreaterThan(0);
    }
  });

  it("mentions AI chat client integration", () => {
    render(<Features />);
    expect(screen.getByText(/Claude/)).toBeInTheDocument();
    expect(screen.getByText(/ChatGPT/)).toBeInTheDocument();
  });
});
