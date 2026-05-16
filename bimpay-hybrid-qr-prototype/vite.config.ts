import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT) || 5173,
    allowedHosts: ["localhost", "clubbing-chemo-vanilla.ngrok-free.dev"],
    proxy: {
      "/api": {
        target: "http://localhost:5050",
        changeOrigin: true,
      },
    },
  },
});