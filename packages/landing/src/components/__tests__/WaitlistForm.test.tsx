import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { WaitlistForm } from "../WaitlistForm";

const ENDPOINT = "https://example.test/waitlist";

function submit(email: string) {
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole("button"));
}

describe("WaitlistForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is disabled and says coming soon without an endpoint", () => {
    render(<WaitlistForm id="test" endpoint="" />);
    expect(screen.getByLabelText(/email address/i)).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /waitlist opens soon/i }),
    ).toBeDisabled();
  });

  it("posts the email as JSON and confirms", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<WaitlistForm id="test" endpoint={ENDPOINT} />);

    submit("a@b.co");

    expect(await screen.findByRole("status")).toHaveTextContent(/on the list/i);
    expect(fetchMock).toHaveBeenCalledWith(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.co" }),
    });
  });

  it("shows an error when the endpoint rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<WaitlistForm id="test" endpoint={ENDPOINT} />);

    submit("a@b.co");

    expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i);
  });

  it("shows an error when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<WaitlistForm id="test" endpoint={ENDPOINT} />);

    submit("a@b.co");

    expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i);
  });
});
