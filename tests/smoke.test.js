import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
import { render, screen } from "@testing-library/svelte";
import Page from "../src/routes/+page.svelte";
import { GET } from "../src/routes/health/+server.js";

describe("generated app smoke test", () => {
  it("renders the registry landing page", () => {
    const { container } = render(Page);
    // By name, not "the only h1": `detail-panel` legitimately renders its own h1
    // in its sample, since a detail page's title is the page's title.
    expect(
      screen.getByRole("heading", { level: 1, name: "@nb UI Registry" }),
    ).toBeInTheDocument();
    // Scoped to the page header: the app-shell sample also says it, as a subtitle.
    expect(container.querySelector("header .micro").textContent).toContain(
      "house design system",
    );
  });

  it("says what the registry is in the lede, and which version it serves", async () => {
    const { container } = render(Page);
    // The block count is *counted* from the catalogue. It said "eleven" while
    // the registry served fourteen -- a literal the page had no way to notice,
    // pinned here by an assertion that also could not notice.
    const catalogue = JSON.parse(
      await readFile(path.join(ROOT, "registry.json"), "utf8"),
    );
    const blocks = catalogue.items.filter(
      (item) => item.type === "registry:block",
    ).length;
    // These two facts used to live in a "what this is" card above the blocks.
    // The card is gone -- it was three paragraphs of prose to scroll past to
    // reach the thing you came for, and on a phone it was most of the first
    // screen -- so the assertions follow the facts to where they now are.
    const lede = container.querySelector("header .lede").textContent;
    expect(lede.toLowerCase()).toContain("one theme");
    expect(lede).toContain(`${blocks} blocks`);

    // The version is read from the published manifest, so the pill cannot
    // advertise one the registry does not serve.
    const published = JSON.parse(
      await readFile(
        path.join(ROOT, "registry", "versions", "manifest.json"),
        "utf8",
      ),
    );
    const versions = [
      ...new Set(published.items.map((item) => item.version)),
    ].sort((a, b) => {
      const [x, y] = [a.split(".").map(Number), b.split(".").map(Number)];
      for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
      return 0;
    });
    expect(container.querySelector("header .pill").textContent.trim()).toBe(
      `v${versions[versions.length - 1]}`,
    );
  });

  it("reports what the device is, so a fix that did not run is visible", () => {
    const { container } = render(Page);
    // The top of the viewport is composited by the OS, so a home-screen window
    // cannot be told apart from a browser tab by looking at the fix -- this
    // line is the difference between "the CSS is wrong" and "the surface was
    // never switched on here".
    const line = container.querySelector("header .device");
    expect(line).not.toBeNull();
    // Server-side it can only say it does not know yet; the words are the
    // contract, the values come from the running document in onMount.
    expect(line.textContent).toContain("top");
    expect(line.textContent).toContain("surface");
  });

  it("puts the index first, so it can be the bar that sticks", () => {
    const { container } = render(Page);
    // Not a style assertion: the index owns the status-bar band (padding, not a
    // sticky offset), and it can only own it if nothing is above it. Move
    // anything ahead of it and the pills end up under the clock on a phone.
    const wrap = container.querySelector(".wrap");
    const first = wrap.firstElementChild;
    expect(first.tagName).toBe("NAV");
    expect(first.getAttribute("aria-label")).toBe("Jump to a group of blocks");
    // ...and every group the bar points at is an element on the page, or a pill
    // goes nowhere.
    const hrefs = [...first.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(wrap.querySelector(href)).not.toBeNull();
    }
  });

  it("groups the blocks, so the bar is a choice and not a list to read", () => {
    const { container } = render(Page);
    const wrap = container.querySelector(".wrap");
    // The bar was fourteen pills in one scrolling row. Fourteen is a list; five
    // groups is a decision, and it is the only navigation this page has.
    const pills = [...wrap.querySelector(".jump").querySelectorAll("a")];
    expect(pills.length).toBeLessThan(8);
    const grouped = new Set(pills.map((a) => a.getAttribute("href")));

    // Every block sits under exactly one group heading, immediately after it,
    // and the heading is what the bar links to.
    const headings = [...wrap.querySelectorAll(".group-head")];
    expect(headings.length).toBe(grouped.size);
    for (const heading of headings) {
      expect(grouped.has(`#${heading.id}`)).toBe(true);
      expect(heading.querySelector(".group-title").textContent.trim()).not.toBe(
        "",
      );
      expect(heading.nextElementSibling.classList.contains("block")).toBe(true);
    }
    // ...and the count in the pill is the count of blocks in that group: the
    // page and the bar read the same field, so a stale number is a stale field.
    for (const pill of pills) {
      const slug = pill.getAttribute("href").replace("#g-", "");
      const blocksHere = [
        ...wrap.querySelectorAll(".block"),
      ].filter((block) => {
        let node = block.previousElementSibling;
        while (node && !node.classList.contains("group-head")) {
          node = node.previousElementSibling;
        }
        return node?.id === `g-${slug}`;
      });
      expect(pill.querySelector(".count").textContent.trim()).toBe(
        String(blocksHere.length),
      );
      expect(blocksHere.length).toBeGreaterThan(0);
    }
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
      path.join(ROOT, "src", "routes", "+page.svelte"),
      "utf8",
    );
    // Comments stripped first: this file explains the bug in prose, and prose
    // is allowed to name the property that the declaration may not use.
    const css = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/<!--[\s\S]*?-->/g, "");
    const rule = css.match(/\.jump \{([\s\S]*?)\n {2}\}/);
    expect(
      rule,
      "the .jump rule moved -- this test reads it by name",
    ).toBeTruthy();
    expect(rule[1]).toContain("background: var(--bg)");
    expect(rule[1]).not.toContain("backdrop-filter");
    // And nothing else may reintroduce a blur at the top of the page.
    expect(css).not.toContain("backdrop-filter");
  });

  it("labels every palette variable with what it is for", () => {
    const { container } = render(Page);
    for (const token of ["bg", "ink", "accent", "ok", "warn", "bad", "mark"]) {
      expect(container.textContent).toContain(`--${token}`);
    }
    // The old "tokens at work" panel showed five pills with no explanation; the
    // labels are the whole point now, so pin one that cannot be guessed.
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
    const page = await readFile(
      path.join(ROOT, "src", "routes", "+page.svelte"),
      "utf8",
    );

    expect(theme).toContain("--safe-top: env(safe-area-inset-top");
    expect(theme).toContain("--safe-bottom: env(safe-area-inset-bottom");
    expect(page).toContain("var(--safe-top");
  });

  it("health endpoint returns ok", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
