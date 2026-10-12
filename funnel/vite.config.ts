import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": here("./src"),
      "@shared": here("./shared"),
    },
  },
  build: {
    // One HTML file per funnel step. Each page only downloads the code it
    // needs, so the subscribe page (the ad landing page) stays tiny.
    rollupOptions: {
      input: {
        subscribe: here("./index.html"),
        xero: here("./xero.html"),
        welcome: here("./welcome.html"),
        sprint: here("./sprint.html"),
        booked: here("./booked.html"),
        privacy: here("./privacy.html"),
      },
    },
  },
  server: {
    // `npm run dev` serves the pages; `/api` goes to `wrangler dev` on 8787.
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
