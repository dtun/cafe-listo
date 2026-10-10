import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors tsup's text loader so `import prompt from "./prompt.md"` works in tests.
  plugins: [
    {
      name: "markdown-as-text",
      transform(code, id) {
        if (id.endsWith(".md")) {
          return { code: `export default ${JSON.stringify(code)};`, map: null };
        }
      },
    },
  ],
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
});
