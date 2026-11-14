import { sveltekit } from "@sveltejs/kit/vite";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit(), svelteTesting()],
  test: {
    environment: "jsdom",
    globals: true,
    // `tests/visual/*.spec.js` is Playwright, and Vitest's default include claim
    // on `*.spec.js` would try to run it under jsdom, where there is no browser
    // and no server. One runner per file kind.
    exclude: ["**/node_modules/**", "**/dist/**", "tests/visual/**"],
    setupFiles: ["src/test-setup.js"],
    reporter: ["default", "junit"],
    outputFile: {
      junit: "./reports/junit.xml",
    },
    coverage: {
      reporter: ["lcov", "text"],
      // The blocks are presentational components: `tests/blocks.test.js` proves
      // each compiles and obeys the token rules, and `tests/gallery.test.js`
      // renders all nine. Counting their function coverage would reward testing
      // markup order, and their props are data-shaped rather than branchy.
      exclude: ["blocks/**"],
      thresholds: {
        statements: 80,
        branches: 50,
        functions: 80,
        lines: 80,
      },
    },
  },
});
