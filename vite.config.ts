import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the bundle works on GitHub Pages project URLs
// (e.g. https://mohreztl.github.io/ultrasur-catalog/) as well as locally.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
