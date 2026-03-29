import { Hero } from "./components/Hero";
import { CategoriesGrid } from "./components/CategoriesGrid";
import { Stats } from "./components/Stats";

export function App() {
  return (
    <main>
      <Hero />
      <Stats />
      <CategoriesGrid />
    </main>
  );
}
