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

  it("puts the index first, so it can be the bar that sticks", () => {
    const { container } = render(Page);
    // Not a style assertion: the index owns the status-bar band (padding, not a
    // sticky offset), and it can only own it if nothing is above it. Move
    // anything ahead of it and the pills end up under the clock on a phone.
    const wrap = container.querySelector(".wrap");
    const first = wrap.firstElementChild;
    expect(first.tagName).toBe("NAV");
    expect(first.getAttribute("aria-label")).toBe("Jump to a block");
    // ...and every demo has the anchor that nav points at, or a pill goes nowhere.
    const hrefs = [...first.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(wrap.querySelector(`section${href}`)).not.toBeNull();
    }
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
