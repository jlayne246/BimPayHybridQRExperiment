import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./bimpay-qr-utility/tests/browser",
  use: { baseURL: "http://127.0.0.1:5180", headless: true,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox"] } },
  webServer: { command: "npm run dev -w bimpay-qr-utility", url: "http://127.0.0.1:5180", reuseExistingServer: false },
});
