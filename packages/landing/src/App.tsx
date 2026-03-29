import { Hero } from "./components/Hero";
import { CategoriesGrid } from "./components/CategoriesGrid";
import { Stats } from "./components/Stats";
import { Features } from "./components/Features";
import { AppStoreLinks } from "./components/AppStoreLinks";

export function App() {
  return (
    <main>
      <Hero />
      <Stats />
      <CategoriesGrid />
      <Features />
      <AppStoreLinks />
    </main>
  );
}
