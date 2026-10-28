import { PREP_ITEMS } from "@cafe-listo/shared";
import { WaitlistForm } from "./WaitlistForm";

export function Hero() {
  return (
    <section className="hero">
      <p className="hero-brand">Cafe Listo</p>
      <h1>
        30 days?
        <br />
        <span>Start with 3.</span>
      </h1>
      <p className="hero-lede">
        That&rsquo;s the official guidance behind this week&rsquo;s headlines.
        Cafe Listo is the {PREP_ITEMS.length}-item checklist that gets your
        household to 72 hours ready, tuned to your FEMA region. It works
        offline.
      </p>
      <WaitlistForm id="hero" />
    </section>
  );
}
