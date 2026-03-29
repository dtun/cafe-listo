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
];

export function Features() {
  return (
    <section>
      <h2>Why Cafe Listo</h2>
      <div>
        {FEATURES.map((feature) => (
          <div key={feature.title}>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
