import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
import { render, screen } from "@testing-library/svelte";
import Page from "../src/routes/+page.svelte";
import BlockPage from "../src/routes/blocks/[name]/+page.svelte";
import SiteHeader from "../src/lib/SiteHeader.svelte";
import { load } from "../src/routes/blocks/[name]/+page.js";
import { load as layoutLoad } from "../src/routes/+layout.js";
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

  it("does not say its own name twice, or date itself", () => {
    const { container } = render(Page);
    // The bar prints "@nb UI Registry" on every route, so a heading repeating it
    // a line lower is the page introducing itself to someone who just read the
    // sign. The sentence under it ("one theme and 14 blocks...") was a claim
    // about the site rather than a way into it, and it is the kind of line that
    // is wrong the moment a block is added. Both are gone; the first thing on
    // the page is a group.
    // Scoped to the page's own children: the index now renders every block as a
    // thumbnail, so a bare ".head" would find one inside a demo.
    expect(container.querySelector(".page > .head")).toBeNull();
    expect(container.querySelector(".page > .lede")).toBeNull();
    expect(container.textContent).not.toContain("no separate gallery");
    expect(container.querySelector(".page").firstElementChild).toBe(
      container.querySelector("h1"),
    );
    expect(container.querySelector("h1 + .groups")).not.toBeNull();
    // The name is still the page's h1, for the outline -- the group cards are
    // h2s -- but it is not drawn.
    const h1 = container.querySelector("h1");
    expect(h1.className).toContain("sr-only");
    expect(h1.textContent.trim()).toBe("@nb UI Registry");
  });

  it("shows every block as a picture of itself, not only as a name", () => {
    const { container } = render(Page);
    const tiles = [...container.querySelectorAll(".tiles > li > a")];
    // One tile per block, in the column's order: the index is a map, and a map
    // with a missing road is worse than a list with a missing line.
    expect(tiles.map((tile) => tile.getAttribute("href"))).toEqual(
      blocks.map((block) => `/blocks/${block.name}`),
    );

    for (const tile of tiles) {
      const name = tile.getAttribute("href").split("/").pop();
      // `:scope >` because the preview inside the tile is a demo, and demos
      // have classes of their own (an action list has project names).
      expect(tile.querySelector(":scope > .name").textContent.trim()).toBe(
        name,
      );

      // The preview is the demo itself, laid out and scaled -- so it cannot be
      // a picture of a shape the registry no longer serves, which is what a
      // checked-in screenshot would become the first time a block changed.
      const frame = tile.querySelector(".thumb .frame");
      expect(frame, `${name} has no preview`).not.toBeNull();
      expect(frame.children.length, `${name} preview is empty`).toBeGreaterThan(0);

      // ...and it is a picture of another page: a button inside it cannot be
      // pressed here, so nothing in it may be focusable or announced.
      expect(tile.querySelector(".thumb").getAttribute("aria-hidden")).toBe(
        "true",
      );
      expect(tile.querySelector(".thumb").hasAttribute("inert")).toBe(true);
    }
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

  it("offers a way home from a page in an installed window", () => {
    // These apps are used from a home screen: no browser chrome, no back
    // button, and no column on a phone (it only exists above 56rem). A block
    // page without a link to "/" is a dead end, so the bar carries one -- and
    // the index itself does not, because a link to the page you are on is noise.
    const inner = render(SiteHeader, { path: "/blocks/bar-series" });
    const back = inner.container.querySelector(".back");
    expect(back).not.toBeNull();
    expect(back.getAttribute("href")).toBe("/");
    expect(back.textContent.trim()).toContain("index");

    const indexPage = render(SiteHeader, { path: "/" });
    expect(indexPage.container.querySelector(".back")).toBeNull();
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

  it("reads alphabetically down the column, with each block under its group", () => {
    // The column is a lookup, so its headings have to be in an order a reader
    // can predict without learning our reasoning. Pinned here because "sorted"
    // is a property of the *file*, not a thing the code does: a group added at
    // the bottom out of order would still render, and still be wrong.
    const labels = groups.map((group) => group.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));

    // ...and each group's own list reads alphabetically. A column is scanned
    // for one name, not read end to end, so the rows have to be in the order a
    // reader would guess rather than the order the shapes are reached for.
    for (const group of groups) {
      const names = inGroup(group.slug).map((block) => block.name);
      expect(names, `${group.label} is out of order`).toEqual(
        [...names].sort((a, b) => a.localeCompare(b)),
      );
    }

    // Previous/next walks `blocks`, so that array must follow the column's group
    // order -- otherwise the footer sends a reader somewhere the column does not
    // agree is next.
    const rank = groups.map((group) => group.slug);
    const seen = blocks.map((block) => rank.indexOf(block.group));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
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

  it("prints an install line that runs, not a sentence about one", () => {
    // The text this replaced said "take one with `npx shadcn-svelte add <name>`
    // against this registry's URL": true, and useless -- the reader still had to
    // find the host, learn that the pin is a path segment, and discover that
    // `--yes` alone writes nothing. The page now prints the command it means,
    // built from the request this reader actually made.
    const { installBase } = layoutLoad({
      url: new URL("http://ryzen:3012/blocks/bar-series"),
    });
    expect(installBase).toBe(`http://ryzen:3012/r/v${latestVersion}`);

    const { container } = render(Page, { data: { installBase } });
    const command = container.querySelector(".cmd").textContent.trim();
    // The three ways the line can be wrong, each pinned: where the pin lives,
    // that the CLI is pinned, and the flag that answers the app.css prompt.
    expect(command).toContain(`COMPONENTS_REGISTRY_URL="${installBase}"`);
    expect(command).toContain("npx shadcn-svelte@1.8.1 add theme bar-series");
    expect(command).toContain("--yes --overwrite");
    expect(command).not.toContain("?version=");
    // And it is real text, so a reader without JS (or with a locked-down
    // clipboard) can still select it.
    expect(container.querySelector(".copy")).not.toBeNull();
  });

  it("names the block it is on in that block's own install line", () => {
    // A block page whose command says "<name>" makes the reader translate the
    // one thing they were sure of. The page knows which block it is.
    const { container } = render(BlockPage, {
      data: { name: "data-table", installBase: "http://ryzen:3012/r/v1.12.0" },
    });
    const command = container.querySelector(".cmd").textContent.trim();
    expect(command).toContain(
      'COMPONENTS_REGISTRY_URL="http://ryzen:3012/r/v1.12.0" npx shadcn-svelte@1.8.1 add theme data-table --yes --overwrite',
    );
  });

  it("spaces the index's cards with one gap, not with per-card margins", async () => {
    // The bug: every card carried its own `margin-bottom`, and the palette card
    // — added later — carried none, so it sat flush against the install card.
    // A missing margin reads as a card that is shorter, not as a page that is
    // wrong. One `gap` on the stack cannot be forgotten by a card that has not
    // been written yet, so that is the rule, and this is the rule's guard.
    const source = await readFile(
      path.join(ROOT, "src", "routes", "+page.svelte"),
      "utf8",
    );
    const css = source
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const stack = css.match(/\n {2}\.page \{([\s\S]*?)\n {2}\}/);
    expect(stack, "the .page rule moved -- this test reads it by name").toBeTruthy();
    expect(stack[1]).toContain("display: flex");
    expect(stack[1]).toContain("gap: 14px");
    expect(css).not.toContain("margin-bottom");
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
