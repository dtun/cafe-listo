import { PREP_ITEMS } from "@cafe-listo/shared";
import { WaitlistForm } from "./WaitlistForm";

export function Hero() {
  return (
    <section className="hero">
      <p className="hero-brand">Cafe Listo</p>
      <h1>
        Don&rsquo;t panic.
        <br />
        <span>Get listo.</span>
      </h1>
      <p className="hero-lede">
        The headlines say 30 days. Official guidance says start with 3. Cafe
        Listo is the {PREP_ITEMS.length}-item checklist that gets your household
        to 72 hours ready, tuned to your FEMA region. It works offline.
      </p>
      <WaitlistForm id="hero" />
    </section>
  );
}
