import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup-env.js", "./tests/setup-mocks.js"],
    globalSetup: ["./tests/global-setup.js"],
    include: ["tests/**/*.test.js"],
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
