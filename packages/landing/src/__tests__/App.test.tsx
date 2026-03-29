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
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Cafe Listo/i);
    expect(screen.getByRole("heading", { name: /categories/i })).toBeInTheDocument();
    expect(screen.getAllByText(/FEMA/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: /why cafe listo/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /get the app/i })).toBeInTheDocument();
  });

  it("uses semantic landmarks", () => {
    render(<App />);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});
