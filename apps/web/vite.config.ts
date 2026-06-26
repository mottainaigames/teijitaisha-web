import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@teijitaisha/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
  },
});
