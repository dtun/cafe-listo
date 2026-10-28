import { CATEGORIES, PREP_ITEMS } from "@cafe-listo/shared";

export function Stats() {
  const essentials = PREP_ITEMS.filter((item) => item.essential).length;
  return (
    <section className="stats">
      <dl>
        <div>
          <dt>Items</dt>
          <dd>{PREP_ITEMS.length}</dd>
        </div>
        <div>
          <dt>Essentials first</dt>
          <dd>{essentials}</dd>
        </div>
        <div>
          <dt>Categories</dt>
          <dd>{CATEGORIES.length}</dd>
        </div>
        <div>
          <dt>Coverage</dt>
          <dd>FEMA Region Ready</dd>
        </div>
      </dl>
    </section>
  );
}
