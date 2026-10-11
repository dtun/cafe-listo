import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  sourcemap: true,
  // The prompt ships inside the bundle, so dist/cli.js runs on its own.
  loader: { ".md": "text" },
  // Workspace packages ship TS source, so inline them; third-party deps stay external.
  noExternal: [/^@cafe-listo\//],
});
