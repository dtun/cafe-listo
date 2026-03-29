import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AppStoreLinks } from "../AppStoreLinks";

describe("AppStoreLinks", () => {
  it("renders an App Store placeholder", () => {
    render(<AppStoreLinks />);
    expect(screen.getByText(/App Store/i)).toBeInTheDocument();
  });

  it("renders a Google Play placeholder", () => {
    render(<AppStoreLinks />);
    expect(screen.getByText(/Google Play/i)).toBeInTheDocument();
  });

  it("indicates coming soon status", () => {
    render(<AppStoreLinks />);
    const badges = screen.getAllByText(/coming soon/i);
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});
