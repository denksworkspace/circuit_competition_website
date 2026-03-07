import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.js"],
        testTimeout: 20_000,
        hookTimeout: 10_000,
        teardownTimeout: 5_000,
        maxWorkers: "50%",
    },
});
