import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PREP_ITEMS } from "@cafe-listo/shared";
import { Hero } from "../Hero";

describe("Hero", () => {
  it("renders the headline in an h1", () => {
    render(<Hero />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/get listo/i);
  });

  it("renders the brand name", () => {
    render(<Hero />);
    expect(screen.getByText("Cafe Listo")).toBeInTheDocument();
  });

  it("contrasts the 30-day headlines with the 3-day baseline", () => {
    render(<Hero />);
    expect(screen.getByText(/30 days/)).toHaveTextContent(/start with 3/);
  });

  it("states the item count from shared data", () => {
    render(<Hero />);
    expect(
      screen.getByText(new RegExp(`${PREP_ITEMS.length}-item checklist`)),
    ).toBeInTheDocument();
  });

  it("renders an email capture field", () => {
    render(<Hero />);
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });
});
