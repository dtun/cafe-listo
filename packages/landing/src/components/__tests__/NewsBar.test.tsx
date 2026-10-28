import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NewsBar } from "../NewsBar";

describe("NewsBar", () => {
  it("renders as a labelled complementary landmark", () => {
    render(<NewsBar />);
    expect(
      screen.getByRole("complementary", { name: /in the news/i }),
    ).toBeInTheDocument();
  });

  it("says no specific threat has been named", () => {
    render(<NewsBar />);
    expect(screen.getByText(/no specific threat/i)).toBeInTheDocument();
  });
});
