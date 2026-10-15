import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
// Proxy /api to a running TrainerLab server so ?live=1 works against the real backend (or ./start.ps1 -Demo / tools/mock-trainerlab.mjs).
const api = { "/api": { target: "http://127.0.0.1:8767", ws: true } };
export default defineConfig({
  plugins: [vue()],
  server: { host: "0.0.0.0", port: 5180, proxy: api },
  preview: { port: 4173, proxy: api },
});
