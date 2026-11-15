import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
import { render, screen } from "@testing-library/svelte";
import Page from "../src/routes/+page.svelte";
import SiteHeader from "../src/lib/SiteHeader.svelte";
import { load } from "../src/routes/blocks/[name]/+page.js";
import {
  blocks,
  groups,
  groupOf,
  inGroup,
  latestVersion,
} from "../src/lib/catalogue.js";
import { GET } from "../src/routes/health/+server.js";
import index from "../registry.json";

const publishedBlocks = index.items
  .filter((item) => item.type === "registry:block")
  .map((item) => item.name);

describe("generated app smoke test", () => {
  it("renders the registry landing page", () => {
    render(Page);
    // By name, not "the only h1": the app-shell demo legitimately renders its
    // own heading. The name of the registry is the page's own h1.
    expect(
      screen.getByRole("heading", { level: 1, name: "@nb UI Registry" }),
    ).toBeInTheDocument();
  });

  it("says what the registry is in the lede, and which version it serves", () => {
    const { container } = render(Page);
    const lede = container.querySelector(".lede").textContent;
    expect(lede.toLowerCase()).toContain("one theme");
    expect(lede).toContain(`${publishedBlocks.length} blocks`);
  });

  it("names the site in the bar, with the release and the build", () => {
    const { container } = render(SiteHeader);
    expect(container.querySelector(".micro").textContent).toContain(
      "house design system",
    );
    // The version is read from the published manifest, so the pill cannot
    // advertise one the registry does not serve. The stamp is the *document*:
    // a page can be on the current release and still be an old bundle.
    expect(container.querySelector(".pill").textContent.trim()).toBe(
      `v${latestVersion}`,
    );
    expect(container.textContent).toContain("build");
  });

  it("reports what the device is, so a fix that did not run is visible", () => {
    const { container } = render(Page);
    // The top of the viewport is composited by the OS, so a home-screen window
    // cannot be told apart from a browser tab by looking at the fix -- this
    // line is the difference between "the CSS is wrong" and "the surface was
    // never switched on here".
    const line = container.querySelector(".device");
    expect(line).not.toBeNull();
    // Server-side it can only say it does not know yet; the words are the
    // contract, the values come from the running document in onMount.
    expect(line.textContent).toContain("top");
    expect(line.textContent).toContain("surface");
  });

  it("gives every published block exactly one page, in one group", () => {
    // The sidebar, the overview cards and the routes all read this list. A
    // second copy of the names is how a navigation points at pages that are not
    // there, and a block in no group is a block no column can link to.
    expect(blocks.map((block) => block.name).sort()).toEqual(
      [...publishedBlocks].sort(),
    );
    expect(new Set(blocks.map((b) => b.name)).size).toBe(blocks.length);
    let counted = 0;
    for (const group of groups) {
      expect(group.label.trim()).not.toBe("");
      expect(group.note.trim()).not.toBe("");
      counted += inGroup(group.slug).length;
    }
    expect(counted).toBe(blocks.length);
    for (const block of blocks) {
      expect(groupOf(block.group), `${block.name} has no group`).toBeTruthy();
      expect(block.note.trim()).not.toBe("");
    }
  });

  it("routes /blocks/<name> for every block, and 404s the rest", () => {
    for (const name of publishedBlocks) {
      expect(load({ params: { name } })).toEqual({ name });
    }
    // `error(404)` throws; a missing block must not render an empty page.
    expect(() => load({ params: { name: "not-a-block" } })).toThrow();
  });

  it("the top bar is an opaque surface, not a pane of glass", async () => {
    // The bug, reported against an iPhone home-screen window: the strip at the
    // top of the viewport rendered washed out and its pills were barely
    // readable. `--bg-overlay` plus `backdrop-filter: blur()` is the right
    // answer for a sheet that floats over a page in a browser tab and the wrong
    // one for the page's own chrome -- iOS composites the status-bar band
    // through the translucent layer, so the ground lifts to a grey smear. This
    // bar is at the top edge of the viewport on every device, which is exactly
    // where a translucent surface cannot be trusted.
    const source = await readFile(
      path.join(ROOT, "src", "lib", "SiteHeader.svelte"),
      "utf8",
    );
    // Comments stripped first: this file explains the bug in prose, and prose
    // is allowed to name the property that the declaration may not use.
    const css = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/<!--[\s\S]*?-->/g, "");
    const rule = css.match(/\.top \{([\s\S]*?)\n {2}\}/);
    expect(
      rule,
      "the .top rule moved -- this test reads it by name",
    ).toBeTruthy();
    expect(rule[1]).toContain("background: var(--bg)");
    expect(rule[1]).not.toContain("backdrop-filter");
    // And nothing else may reintroduce a blur at the top of the page.
    const layout = await readFile(
      path.join(ROOT, "src", "routes", "+layout.svelte"),
      "utf8",
    );
    expect(css).not.toContain("backdrop-filter");
    expect(layout).not.toContain("backdrop-filter");
  });

  it("labels every palette variable with what it is for", () => {
    const { container } = render(Page);
    for (const token of ["bg", "ink", "accent", "ok", "warn", "bad", "mark"]) {
      expect(container.textContent).toContain(`--${token}`);
    }
    // A swatch with no explanation is decoration; the labels are the whole
    // point, so pin one that cannot be guessed.
    expect(container.textContent).toContain(
      "the matched words inside a snippet",
    );
  });

  it("spends the safe-area insets instead of drawing under the status bar", async () => {
    // The bug: `viewport-fit=cover` + a black-translucent status bar means iOS
    // draws the clock *over* the page. The theme buys four insets; this asserts
    // something spends them, because a page that ignores them looks fine on a
    // desktop and hides its own header on a home screen.
    const theme = await readFile(path.join(ROOT, "src", "app.css"), "utf8");
    const header = await readFile(
      path.join(ROOT, "src", "lib", "SiteHeader.svelte"),
      "utf8",
    );
    const layout = await readFile(
      path.join(ROOT, "src", "routes", "+layout.svelte"),
      "utf8",
    );

    expect(theme).toContain("--safe-top: env(safe-area-inset-top");
    expect(theme).toContain("--safe-bottom: env(safe-area-inset-bottom");
    expect(header).toContain("var(--safe-top");
    expect(layout).toContain("var(--safe-bottom");
  });

  it("health endpoint returns ok", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
