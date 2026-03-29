import { Hero } from "./components/Hero";
import { CategoriesGrid } from "./components/CategoriesGrid";
import { Stats } from "./components/Stats";
import { Features } from "./components/Features";
import { AppStoreLinks } from "./components/AppStoreLinks";
import { Footer } from "./components/Footer";

export function App() {
  return (
    <>
      <header>
        <Hero />
      </header>
      <main>
        <Stats />
        <CategoriesGrid />
        <Features />
        <AppStoreLinks />
      </main>
      <Footer />
    </>
  );
}
