import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/forge/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
