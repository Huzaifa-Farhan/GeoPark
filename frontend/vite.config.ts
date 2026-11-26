import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In development the browser talks to Vite, which forwards /api/* to the coordinator.
// To point at a different coordinator, set VITE_API_URL (e.g. http://192.168.1.10:8000).
// The browser never calls the individual lot services.
const proxy = { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy },
  preview: { port: 5173, proxy },
});
