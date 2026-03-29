import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { App } from "../App";

describe("App", () => {
  it("renders without crashing", () => {
    render(<App />);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("has exactly one h1 element", () => {
    render(<App />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
  });

  it("renders all page sections", () => {
    render(<App />);
    expect(screen.getByText(/Cafe Listo/i)).toBeInTheDocument();
    expect(screen.getByText(/Categories/i)).toBeInTheDocument();
    expect(screen.getByText(/FEMA/i)).toBeInTheDocument();
    expect(screen.getByText(/Why Cafe Listo/i)).toBeInTheDocument();
    expect(screen.getByText(/App Store/i)).toBeInTheDocument();
  });

  it("uses semantic landmarks", () => {
    render(<App />);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});
