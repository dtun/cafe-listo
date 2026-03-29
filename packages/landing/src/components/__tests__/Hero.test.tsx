import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Hero } from "../Hero";

describe("Hero", () => {
  it("renders the app name in an h1", () => {
    render(<Hero />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/Cafe Listo/i);
  });

  it("renders a tagline about emergency readiness", () => {
    render(<Hero />);
    expect(screen.getByText(/ready/i)).toBeInTheDocument();
  });

  it("renders a call-to-action link", () => {
    render(<Hero />);
    const cta = screen.getByRole("link", { name: /get started/i });
    expect(cta).toBeInTheDocument();
  });
});
