import { CATEGORIES, getItemsByCategory } from "@cafe-listo/shared";

export function CategoriesGrid() {
  return (
    <section>
      <h2>Categories</h2>
      <div>
        {CATEGORIES.map((category) => {
          const count = getItemsByCategory(category.id).length;
          return (
            <div key={category.id}>
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
