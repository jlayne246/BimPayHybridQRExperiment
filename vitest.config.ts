import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { restoreMocks: true, include: ["packages/*/tests/**/*.test.ts", "bimpay-qr-utility/tests/**/*.test.tsx"], environment: "node" },
});
