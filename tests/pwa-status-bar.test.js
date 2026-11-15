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

  it("does not ask iOS for a translucent status bar", () => {
    // The structural half of the fix. `black-translucent` is the value that
    // invites the page to be drawn *under* the status bar, and every layer we
    // could paint there is a layer the OS can composite over. `black` asks for
    // a solid strip and a page that starts below it -- so the top of the UI is
    // ours alone. A page cannot fix an OS-material by degrees; it can decline
    // to be underneath it.
    const meta =
      /<meta\s+name="apple-mobile-web-app-status-bar-style"\s+content="([^"]+)"/.exec(
        html,
      );
    expect(meta?.[1]).toBe("black");
    expect(html).not.toContain('content="black-translucent"');
  });

  it("does not ask for the status-bar band at all", () => {
    // The fourth and last layer. With `viewport-fit=cover` the web view extends
    // under the system chrome, so `env(safe-area-inset-top)` is non-zero and
    // whatever the system paints there lands on our pixels -- which is why an
    // opaque bar, a colour surface and an opaque status bar style each fixed
    // something real and none of them made the top of the page crisp. Without
    // `cover` the viewport starts below the band and there is nothing of ours
    // to composite over. A consumer app that wants full-bleed is free to opt
    // back in; this page is the reference, so it shows the safe answer.
    // Comments stripped: this file explains the decision, and the prose is
    // allowed to name the value the meta may not use.
    const markup = html.replace(/<!--[\s\S]*?-->/g, "");
    const viewport = /<meta\s+name="viewport"\s+content="([^"]+)"/.exec(markup);
    expect(viewport?.[1]).toBe("width=device-width, initial-scale=1");
    expect(markup).not.toContain("viewport-fit");
  });

  it("meets WebKit's sampling contract without painting over anything", () => {
    const css = enabled().replace(/\s+/g, " ");
    expect(css).toContain("position: fixed");
    expect(css).toContain("inset: 0 0 auto");
    // 11px clears the 10px thin-border threshold; the inset is added because
    // the band the engine composites over is the safe area, not its top 11px.
    expect(css).toContain("height: calc(11px + env(safe-area-inset-top, 0px))");
    expect(css).toContain("pointer-events: none");
    expect(css).toContain("background-color: inherit");
    expect(css).toContain("background-clip: text"); // empty text paints nothing
    expect(css).toContain("-webkit-background-clip: text");
  });
});
