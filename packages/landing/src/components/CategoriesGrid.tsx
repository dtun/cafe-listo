import { CATEGORIES, getItemsByCategory } from "@cafe-listo/shared";

export function CategoriesGrid() {
  return (
    <section className="categories">
      <h2>Categories</h2>
      <div className="categories-grid">
        {CATEGORIES.map((category) => {
          const count = getItemsByCategory(category.id).length;
          return (
            <div className="category-card" key={category.id}>
              <span>{category.emoji}</span>
              <h3>{category.label}</h3>
              <p>{count} items</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
