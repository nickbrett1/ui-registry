import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

// The published list, read from disk rather than imported: this file runs under
// Playwright's transform, and the point of the check is the committed index.
const INDEX = JSON.parse(
  readFileSync(new URL("../../registry.json", import.meta.url), "utf8"),
);

/**
 * Phase 4's gate, in the two halves the config explains: styles are a test,
 * screenshots are evidence.
 *
 * The style snapshot deliberately records *computed* values, not declarations:
 * a block that starts inheriting `--ink-faint` from somewhere else, or whose
 * radius drifts because a utility class won, shows up here even though no line
 * in the block changed. That is the failure a consumer actually sees.
 */
const BASELINE = new URL("./baseline.json", import.meta.url).pathname;
const SCREENS = "reports/screens";

// The properties that make a house screen look like a house screen: colour,
// type, spacing, radii and layout. Not width/height (they follow the viewport)
// and not transform (animation state).
const PROPS = [
  "color",
  "backgroundColor",
  "borderTopColor",
  "borderTopWidth",
  "borderTopStyle",
  "borderTopLeftRadius",
  "fontSize",
  "fontWeight",
  "fontFamily",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "display",
  "gap",
  "paddingTop",
  "paddingLeft",
  "marginTop",
  "gridTemplateColumns",
  "textAlign",
  "fontVariantNumeric",
];

const MAX_ELEMENTS = 80;
const MAX_DEPTH = 5;

async function snapshotSection(section) {
  return section.evaluate(
    (root, { props, maxElements, maxDepth }) => {
      const out = [];
      const walk = (element, depth) => {
        if (out.length >= maxElements || depth > maxDepth) return;
        const style = getComputedStyle(element);
        const classes = [...element.classList].sort().join(".");
        out.push({
          tag: element.tagName.toLowerCase() + (classes ? `.${classes}` : ""),
          style: Object.fromEntries(props.map((p) => [p, style[p] ?? ""])),
        });
        for (const child of element.children) walk(child, depth + 1);
      };
      walk(root, 0);
      return out;
    },
    { props: PROPS, maxElements: MAX_ELEMENTS, maxDepth: MAX_DEPTH },
  );
}

const UPDATE = !!process.env.UPDATE_VISUAL;

function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE, "utf8"));
  } catch {
    return {};
  }
}

test.describe("the block pages, measured", () => {
  test("the column and the index both link to every published block", async ({
    page,
  }) => {
    await page.goto("/");
    const hrefsOf = (selector) =>
      page
        .locator(selector)
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));

    // Not a literal list: the navigation must reach every block the registry
    // publishes, which is the failure a reader describes as "I could not find
    // it" and no unit test can see. Two navigations, one on each side of the
    // 56rem breakpoint -- the column is hidden on a phone and the index cards
    // are what is left, so both have to be complete, not just the one the
    // desktop happens to use.
    const published = INDEX.items
      .filter((item) => item.type === "registry:block")
      .map((item) => `/blocks/${item.name}`)
      // The column groups the blocks the way a screen is built; the registry
      // lists them as it lists them. Same set, two orders -- compare the set.
      .sort();
    for (const selector of ["aside.sidebar nav a", "main .groups a"]) {
      expect([...(await hrefsOf(selector))].sort(), selector).toEqual(published);
    }
  });

  test("every block keeps its computed style", async ({ page }, testInfo) => {
    mkdirSync(SCREENS, { recursive: true });

    // Not a literal count: the gallery must measure every block the registry
    // publishes, which is what this file is the gate for.
    const published = INDEX.items
      .filter((item) => item.type === "registry:block")
      .map((item) => item.name)
      .sort();

    const current = readBaseline();
    const next = UPDATE ? {} : null;
    const project = testInfo.project.name;

    for (const id of published) {
      // One page per block now: the demo is what changes, and it is measured on
      // its own -- a block compared against the page ground and a block on a
      // card resolve different colours, so the surface is part of the reading.
      await page.goto(`/blocks/${id}`);
      const section = page.locator(".stage");
      await section.waitFor();

      // Evidence: one image per block per viewport, uploaded by CI. Not compared
      // -- see the config for why pixels cannot be the gate.
      await section.screenshot({ path: `${SCREENS}/${id}-${project}.png` });

      const styles = await snapshotSection(section);
      // Keyed by project as well as block: a phone is not a smaller desktop, and
      // the same block legitimately resolves different layout at 412px. One flat
      // map meant the phone run overwrote the desktop entries and the desktop
      // test then failed against a phone's expectations.
      const key = `${project}/${id}`;
      if (next) next[key] = styles;
      else {
        const expected = current[key];
        // A new block has no baseline yet; a changed one has a diff worth reading.
        expect(
          expected,
          `no style baseline for "${key}" -- run npm run shots:baseline`,
        ).toBeTruthy();
        expect(styles, `"${key}" moved`).toEqual(expected);
      }
    }

    if (next) {
      // Re-read at write time and merge on top: `UPDATE_VISUAL=1 npm run
      // shots:baseline` runs serially (see package.json) because two projects
      // writing one JSON file means the last writer deletes the other's keys.
      const merged = { ...readBaseline(), ...next };
      writeFileSync(BASELINE, `${JSON.stringify(merged, null, 2)}\n`);
    }
  });
});
