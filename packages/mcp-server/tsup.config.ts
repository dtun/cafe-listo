import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  sourcemap: true,
  // Workspace packages ship TS source, so inline them; third-party deps stay external.
  noExternal: [/^@cafe-listo\//],
});
