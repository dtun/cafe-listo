import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Footer } from "../Footer";

describe("Footer", () => {
  it("renders the project name", () => {
    render(<Footer />);
    expect(screen.getByText(/Cafe Listo/i)).toBeInTheDocument();
  });

  it("renders inside a footer element", () => {
    render(<Footer />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});
