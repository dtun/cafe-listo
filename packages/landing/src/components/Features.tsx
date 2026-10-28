const FEATURES = [
  {
    title: "Works Offline",
    description:
      "Your checklist stays on your phone. It still works when the power and the cell towers don't.",
  },
  {
    title: "Region-Specific Guidance",
    description:
      "Notes for your FEMA region, from hurricane season to wildfire smoke to extreme heat.",
  },
  {
    title: "Essentials First",
    description:
      "See what you already have, what's missing, and which gaps to close first.",
  },
  {
    title: "AI Chat Integration",
    description:
      "Check your kit from AI chat clients like Claude and ChatGPT, in the tools you already use.",
  },
];

export function Features() {
  return (
    <section className="features">
      <h2>Why Cafe Listo</h2>
      <div className="features-grid">
        {FEATURES.map((feature) => (
          <div className="feature-card" key={feature.title}>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
