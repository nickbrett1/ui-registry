import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve(process.cwd(), "src/app.html"), "utf8");
const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
const body = /<body[^>]*>([\s\S]*?)<\/body>/.exec(html)?.[1] ?? "";

const rule = (selector) => {
  const match = new RegExp(`\\${selector}\\s*\\{([\\s\\S]*?)\\}`).exec(style);
  return match ? match[1] : "";
};

const enabled = () => {
  // The enabled rule is the one inside @supports + @media, so it declares a
  // position; the base rule only hides the surface.
  const matches = [
    ...style.matchAll(/\.pwa-status-bar-surface\s*\{([\s\S]*?)\}/g),
  ];
  const rule = matches.find((m) => m[1].includes("position: fixed"));
  return rule ? rule[1] : "";
};

describe("the iOS top-edge surface", () => {
  it("is in the document before the bundle runs, and outside the hydrated root", () => {
    const surfaces = body.match(/class="pwa-status-bar-surface"/g) ?? [];
    expect(surfaces).toHaveLength(1);
    // `%sveltekit.body%` is the app; SvelteKit replaces the children of the
    // wrapper div, so a surface inside it would not survive a route change.
    const rootAt = body.indexOf("%sveltekit.body%");
    expect(body.indexOf("pwa-status-bar-surface")).toBeLessThan(rootAt);
    expect(body).toContain('aria-hidden="true"');
  });

  it("is hidden everywhere that is not a standalone WebKit window", () => {
    expect(rule(".pwa-status-bar-surface").replace(/\s+/g, " ").trim()).toBe(
      "display: none;",
    );
    expect(style).toContain(
      "@supports (-webkit-touch-callout: none) and (background-clip: text)",
    );
    expect(style).toContain("@media (display-mode: standalone)");
  });

  it("meets WebKit's sampling contract without painting over anything", () => {
    const css = enabled().replace(/\s+/g, " ");
    expect(css).toContain("position: fixed");
    expect(css).toContain("inset: 0 0 auto");
    expect(css).toContain("height: 11px"); // > the 10px thin-border threshold
    expect(css).toContain("pointer-events: none");
    expect(css).toContain("background-color: inherit");
    expect(css).toContain("background-clip: text"); // empty text paints nothing
    expect(css).toContain("-webkit-background-clip: text");
  });
});
