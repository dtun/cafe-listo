import { useState, type FormEvent } from "react";

type Status = "idle" | "submitting" | "success" | "error";

interface WaitlistFormProps {
  id: string;
  endpoint?: string;
}

export function WaitlistForm({
  id,
  endpoint = import.meta.env.VITE_WAITLIST_ENDPOINT,
}: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const open = Boolean(endpoint);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!endpoint) return;
    setStatus("submitting");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setStatus(response.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <p className="waitlist-message" role="status">
        You&rsquo;re on the list. One email when Cafe Listo launches.
      </p>
    );
  }

  const inputId = `${id}-email`;

  return (
    <form className="waitlist" onSubmit={handleSubmit}>
      <label className="visually-hidden" htmlFor={inputId}>
        Email address
      </label>
      <input
        id={inputId}
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={!open}
      />
      <button type="submit" disabled={!open || status === "submitting"}>
        {open ? "Get early access" : "Waitlist opens soon"}
      </button>
      <p
        className="waitlist-note"
        role={status === "error" ? "alert" : undefined}
      >
        {status === "error"
          ? "That didn't go through. Try again in a minute."
          : "Launching on iOS and Android. One email when it's live. No spam."}
      </p>
    </form>
  );
}
