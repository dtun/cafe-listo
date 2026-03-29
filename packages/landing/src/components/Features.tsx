const FEATURES = [
  {
    title: "Works Offline",
    description:
      "Your checklist is always available, even when cell towers go down during an emergency.",
  },
  {
    title: "Region-Specific Guidance",
    description:
      "Tailored recommendations for your FEMA region — from hurricane prep to wildfire readiness.",
  },
  {
    title: "Track Your Progress",
    description:
      "See exactly where you stand across all categories and know what to prioritize next.",
  },
  {
    title: "AI Chat Integration",
    description:
      "Access your checklist through AI chat clients like Claude and ChatGPT — get guidance right where you already work.",
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
