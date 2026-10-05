import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Freebuff preview injects PORT and requires HMR to stay disabled.
const port = Number(process.env.PORT) || 5173;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    port,
    strictPort: true,
    hmr: false,
  },
  preview: {
    host: true,
    port,
    strictPort: true,
  },
});
