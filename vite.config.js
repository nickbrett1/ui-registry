import { execSync } from "node:child_process";
import { sveltekit } from "@sveltejs/kit/vite";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vite";

/**
 * The commit this bundle was built from, so a page can name its own build.
 *
 * The version pill reads the *registry's* published version, which is not the
 * same thing: the top-edge surface and the cache header shipped without moving
 * a registry version, so "1.16.1" in the app could not tell anyone whether the
 * page on the phone was the current one. A build stamp can.
 */
function buildStamp() {
  // Environment first. The image build excludes `.git` from its context
  // (`.dockerignore`), so `git rev-parse` there answers nothing and the page
  // said `build unknown` while running a perfectly good commit -- the pill was
  // right and unhelpful at once. CI knows the revision; pass it in.
  for (const name of ["NB_BUILD_COMMIT", "BUILDKITE_COMMIT", "GITHUB_SHA"]) {
    const fromEnv = process.env[name];
    if (fromEnv) return fromEnv.slice(0, 7);
  }
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: { __NB_BUILD__: JSON.stringify(buildStamp()) },
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
