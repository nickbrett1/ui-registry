import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

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

test.describe("the gallery, measured", () => {
  test("every block keeps its computed style", async ({ page }, testInfo) => {
    await page.goto("/");
    mkdirSync(SCREENS, { recursive: true });

    const ids = await page
      .locator("section.block")
      .evaluateAll((sections) => sections.map((section) => section.id));
    expect(ids.length).toBeGreaterThanOrEqual(11);

    const current = readBaseline();
    const next = UPDATE ? {} : null;
    const project = testInfo.project.name;

    for (const id of ids) {
      const section = page.locator(`section.block#${id}`);
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
      const merged = { ...current, ...next };
      writeFileSync(BASELINE, `${JSON.stringify(merged, null, 2)}\n`);
    }
  });
});
