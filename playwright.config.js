import { defineConfig, devices } from "@playwright/test";

/**
 * The visual gate: what the eighteen blocks look like, measured.
 *
 * There are two halves, and the split is deliberate.
 *
 * **Styles are a test.** A block's appearance is almost entirely computed style:
 * the ground it sits on, its ink, its hairlines, the card radius, the micro-label
 * size and tracking, the tabular figures. Those resolve to *the same numbers on
 * every machine*, because they come from the theme's tokens and not from a font
 * rasteriser. So `baseline.json` is a committed snapshot of them and a change to
 * any of it fails the build. This is the half that can gate.
 *
 * **Screenshots are evidence.** A PNG diff compares font hinting and gamma as
 * much as design, so a committed pixel baseline either fails on CI's machine or
 * has to be tolerated so loosely that it stops noticing. Instead every run writes
 * `reports/screens/<block>-<viewport>.png` and CI uploads them: "unchanged by eye"
 * is then a claim a person can check in one look, per build, against the previous
 * one -- which is what was actually missing when a consumer re-vendored a block
 * and nothing showed whether the page had moved.
 */
export default defineConfig({
  testDir: "tests/visual",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI
    ? [["list"], ["junit", { outputFile: "reports/visual.xml" }]]
    : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    colorScheme: "dark",
    // Animations and caret movement are not design; a transition caught mid-flight
    // would make both halves disagree with themselves between runs.
    launchOptions: {
      args: ["--force-color-profile=srgb", "--font-render-hinting=none"],
    },
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
      },
    },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // The production server, not `vite preview`: adapter-node's output is what
    // ships to the container, so this measures the artifact rather than a
    // development build that happens to serve the same routes.
    command:
      "npm run build && PORT=4173 ORIGIN=http://127.0.0.1:4173 node build/index.js",
    url: "http://127.0.0.1:4173/health",
    // Not `!process.env.CI`: a server already on the port is *some other build*,
    // and reusing it silently measures code that is not this checkout. That cost
    // one confusing "0 blocks" run; rebuilding takes seconds.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
