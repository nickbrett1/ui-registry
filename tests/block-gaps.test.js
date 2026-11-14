import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { readFile } from "node:fs/promises";
import path from "node:path";

import AppShell from "../blocks/app-shell/AppShell.svelte";
import ResultList from "../blocks/result-list/ResultList.svelte";
import FilterPanel from "../blocks/filter-panel/FilterPanel.svelte";
import BurstTimeline from "../blocks/burst-timeline/BurstTimeline.svelte";

/**
 * The four gaps that v1.4.0 closes.
 *
 * Each of these was found by converting stratechery-search, and each one was a
 * reason to stop using a block rather than a small annoyance:
 *
 *   1. AppShell had no place for primary navigation or a mark.
 *   2. ResultList rows could not carry more than four strings, and its title was
 *      not a heading, so the section vanished from the document outline.
 *   3. FilterPanel only accepted one facet shape; an API emitting another had to
 *      reshape its response in the page.
 *   4. BurstTimeline was vertical-only with a hard-coded "recent bursts" caption.
 *
 * The point of the tests is that the *defaults* still behave as they did at
 * 1.3.0 — these props are additive, not a redesign of what consumers already
 * installed — while the new path works.
 */
// These two are CSS, so they cannot be asserted through the DOM in jsdom (no
// layout). They are read from the source instead -- the same reason
// tests/smoke.test.js reads app.css for the safe-area variables: the failure
// mode is invisible on a desktop and obvious on a phone.
const appShellSource = await readFile(
  path.join(process.cwd(), "blocks", "app-shell", "AppShell.svelte"),
  "utf8",
);

describe("AppShell: the bar survives a real product name", () => {
  it("truncates the wordmark instead of wrapping the sticky bar", () => {
    expect(appShellSource).toMatch(
      /\.wordmark \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;/,
    );
    expect(appShellSource).toMatch(/\.titles \{[^}]*min-width: 0;/);
  });

  it("keeps the actions end of the bar at its own width", () => {
    expect(appShellSource).toMatch(/\.bar-end \{[^}]*flex: 0 0 auto;/);
  });
});

describe("AppShell: the slots a real app needs", () => {
  const mark = createRawSnippet(() => ({
    render: () => `<svg id="brand-mark"></svg>`,
  }));
  const actions = createRawSnippet(() => ({
    render: () => `<nav id="primary-nav"><a href="/runs">runs</a></nav>`,
  }));

  it("keeps the wordmark an h1 by default, so a dashboard outline is unchanged", () => {
    const { container } = render(AppShell, { title: "data-download" });
    const wordmark = container.querySelector(".topbar .wordmark");
    expect(wordmark.tagName).toBe("H1");
  });

  it("lets a page keep its own h1 by demoting the wordmark", () => {
    const { container } = render(AppShell, {
      title: "Stratechery Search",
      titleTag: "div",
    });
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector(".wordmark").textContent).toBe(
      "Stratechery Search",
    );
  });

  it("renders a mark before the titles and actions on the right of the bar", () => {
    const { container } = render(AppShell, {
      title: "data-download",
      mark,
      actions,
    });
    expect(container.querySelector("#brand-mark")).not.toBeNull();
    expect(container.querySelector("#primary-nav")).not.toBeNull();
    // The nav is in the bar, not in the main column: that was the whole gap.
    expect(container.querySelector(".topbar #primary-nav")).not.toBeNull();
  });

  it("takes a back control instead of a back link (1.5.0)", () => {
    const back = createRawSnippet(() => ({
      render: () => `<button id="app-back" type="button">back</button>`,
    }));
    const { container } = render(AppShell, {
      title: "drill",
      back,
      backHref: "/ignored",
    });
    // The snippet wins over backHref: an in-app router's back is an action
    // (history.back), and a link would push a new entry instead of popping.
    expect(container.querySelector("#app-back")).not.toBeNull();
    expect(container.querySelector("a.pill.back")).toBeNull();
  });

  it("still renders without either slot", () => {
    const { container } = render(AppShell, { title: "plain" });
    expect(container.querySelector(".wordmark").textContent).toBe("plain");
    expect(container.querySelector("#primary-nav")).toBeNull();
  });
});

describe("AppShell: the app's views are visible, not hidden behind a pill (1.10.0)", () => {
  const views = [
    { label: "Requests", href: "/", current: true },
    { label: "Plan types", href: "/plan-types", current: false },
  ];

  it("renders every view in the bar, and marks the one you are on", () => {
    const { container } = render(AppShell, {
      title: "data-download",
      nav: views,
    });
    const links = container.querySelectorAll(".main-nav a");
    expect([...links].map((a) => a.textContent.trim())).toEqual([
      "Requests",
      "Plan types",
    ]);
    expect(links[0].getAttribute("aria-current")).toBe("page");
    // Not "false": the attribute has to be absent on the other tabs, or every
    // tab announces itself as the current page.
    expect(links[1].hasAttribute("aria-current")).toBe(false);
  });

  it("is navigation, not the actions slot: a destination does not look like a state", () => {
    // The bug this closes: data-download put `<a class="pill">Plan types</a>`
    // in `actions`, where it sat next to the status pill and read as one.
    expect(appShellSource).toMatch(
      /\.main-nav a\[aria-current="page"\] \{[^}]*background: var\(--accent-soft\);[^}]*color: var\(--accent\);/,
    );
    expect(appShellSource).toMatch(
      /\.pill\.back|\.main-nav a \{[\s\S]*?border-radius: var\(--radius-sm\)/,
    );
  });

  it("names the nav for a screen reader, defaulting to 'Sections'", () => {
    const { container } = render(AppShell, { nav: views });
    expect(
      container.querySelector("nav.main-nav")?.getAttribute("aria-label"),
    ).toBe("Sections");
  });

  it("renders no nav at all when none is given, so 1.9.0 output is unchanged", () => {
    const { container } = render(AppShell, { title: "data-download" });
    expect(container.querySelector(".main-nav")).toBeNull();
  });

  it("drops the micro subtitle on a narrow phone rather than the second view", () => {
    // The subtitle repeats what the highlighted tab says; the tabs are the only
    // way to discover the other views. Height is too expensive to spend twice.
    expect(appShellSource).toMatch(
      /@media \(max-width: 520px\) \{[\s\S]*?\.has-nav \.titles \.micro \{\s*display: none;/,
    );
  });
});

describe("AppShell: the notch inset does not eat the page title (1.10.1)", () => {
  it("pins the bar at 0 and puts the inset in its padding, not its offset", () => {
    // Found on a phone after 1.10.0 shipped: `position: sticky; top: 47px`
    // paints the bar 47px lower while its flow box stays at the top, so it
    // covers the first 47px of content -- measured, the page's own `.lede` sat
    // at 79-101 and the bar at 47-102, so elementFromPoint at the lede centre
    // returned the bar. Padding moves the flow with the bar; `top` does not.
    expect(appShellSource).toMatch(
      /\.topbar \{[^}]*top: 0;[^}]*padding-top: var\(--safe-top, 0px\);/,
    );
    expect(appShellSource).not.toMatch(/(?<!padding-)top: var\(--safe-top/);
  });

  it("uses the dynamic viewport height, so the footer is not below the toolbar", () => {
    expect(appShellSource).toMatch(/min-height: 100dvh;/);
  });
});

describe("AppShell: a card is not a viewport (1.11.0)", () => {
  // Found on gethomepage: the deepseek-balance widget is iframed into a
  // dashboard card and reports `document.body.offsetHeight` to its parent
  // every 1500ms (Homepage's `homepage-iframe-resize` contract). The shell's
  // `min-height: 100dvh` makes <body> at least as tall as the iframe, so the
  // reporter measured the *frame*, not the content, and each poll asked for a
  // taller one -- unbounded blank space under the widget. A shell that is a
  // card must not claim a viewport.
  it("drops the viewport min-height only when embedded", () => {
    expect(appShellSource).toMatch(/\.shell \{[^}]*min-height: 100dvh;/);
    expect(appShellSource).toMatch(/\.shell\.embedded \{[^}]*min-height: 0;/);
  });

  it("hangs the class off the prop, so the default install is unchanged", () => {
    expect(appShellSource).toMatch(/class:embedded/);
    expect(appShellSource).toMatch(/embedded = false,/);
  });

  it("omits the house footer inside a card, where the parent owns the chrome", () => {
    const card = render(AppShell, { title: "DeepSeek Balance", embedded: true });
    expect(card.container.querySelector("footer")).toBeNull();
    expect(card.container.textContent).not.toContain("house design system");
  });

  it("still renders a footer the caller explicitly asked for", () => {
    const footer = createRawSnippet(() => ({
      render: () => `<span id="own-footer">refreshed 2m ago</span>`,
    }));
    const card = render(AppShell, { title: "DeepSeek Balance", embedded: true, footer });
    expect(card.container.querySelector("#own-footer")).not.toBeNull();
  });

  it("keeps the footer on a normal page", () => {
    const page = render(AppShell, { title: "data-download" });
    expect(page.container.textContent).toContain("house design system");
  });

  it("lets a page say it has no footer, without pretending to be a card", () => {
    // 1.12.0. `embedded` was the only way to drop the strip, and it also drops
    // the page's min-height -- so a page whose content *is* the ending had to
    // fork the block. data-download did, and the fork was invisible until the
    // drift check diffed it.
    const page = render(AppShell, { title: "data-download", footer: false });
    expect(page.container.querySelector("footer")).toBeNull();
    expect(page.container.textContent).not.toContain("house design system");
    // Still a page: the viewport-height rule is untouched.
    expect(page.container.querySelector(".shell").classList).not.toContain(
      "embedded",
    );
  });
});

describe("ResultList: rich rows and a real heading", () => {
  const items = [
    { title: "Interval scheduling under load", meta: "2026-11-12" },
    { title: "Why the cache layer went cold", meta: "2026-11-11" },
    { title: "Small tools, sharp edges", meta: "2026-11-09" },
  ];

  it("renders its title as the element titleTag names", () => {
    const { container } = render(ResultList, {
      items,
      title: "Elsewhere",
      titleTag: "h2",
    });
    const heading = container.querySelector("h2.section-title");
    expect(heading).not.toBeNull();
    expect(heading.textContent).toContain("Elsewhere");
    expect(heading.textContent).toContain("(3)");
  });

  it("keeps the default title element a div, so 1.3.0 output is unchanged", () => {
    const { container } = render(ResultList, { items, title: "Matches" });
    expect(container.querySelector(".section-title").tagName).toBe("DIV");
  });

  it("lets a row carry its own markup while the block keeps the rank and the fold", () => {
    const row = createRawSnippet((item) => ({
      render: () =>
        `<div class="rich-row">${item.title} <mark>passage</mark></div>`,
    }));
    const { container } = render(ResultList, { items, initialCount: 2, row });

    expect(container.querySelectorAll(".rich-row").length).toBe(2);
    expect(container.querySelector(".rich-row mark").textContent).toBe(
      "passage",
    );
    // Rank numbering and the fold still belong to the block.
    expect(container.querySelector(".rank").textContent).toBe("1");
    expect(container.textContent).toContain("Show 1 more…");
  });

  it("does not render the snippet body when no row snippet is given", () => {
    const { container } = render(ResultList, { items });
    expect(container.querySelector(".rich-row")).toBeNull();
    expect(container.querySelector(".row-title").textContent).toBe(
      items[0].title,
    );
  });
});

describe("FilterPanel: accepting the API's facet shape", () => {
  // What stratechery-search's endpoint actually sends.
  const raw = {
    state: [
      { value: "done", count: 42 },
      { value: "stuck", count: 3 },
    ],
  };
  const labels = { state: "State" };
  const adaptFacets = (payload) =>
    Object.entries(payload).map(([key, options]) => ({
      key,
      label: labels[key] ?? key,
      options: options.map((o) => ({ ...o, label: o.value })),
    }));

  it("renders facets through the adapter, with counts", () => {
    const { container } = render(FilterPanel, {
      facets: raw,
      adaptFacets,
      selected: {},
    });
    expect(container.querySelector(".facet-label").textContent).toBe("State");
    expect(container.querySelectorAll(".facet-option").length).toBe(2);
    expect(container.querySelector(".option-count").textContent).toBe("42");
  });

  it("still renders a canonical facet list with no adapter", () => {
    const canonical = [
      {
        key: "kind",
        label: "Kind",
        options: [{ value: "request", label: "Request", count: 28 }],
      },
    ];
    const { container } = render(FilterPanel, {
      facets: canonical,
      selected: {},
    });
    expect(container.querySelector(".facet-label").textContent).toBe("Kind");
    expect(container.querySelector(".option-label").textContent).toBe(
      "Request",
    );
  });
});

describe("FilterPanel: a facet that is one choice from N (1.7.0)", () => {
  const years = [
    {
      key: "year",
      label: "Year",
      mode: "single",
      layout: "bars",
      note: "one year, or none",
      options: [
        { value: "2018", label: "2018", count: 2 },
        { value: "2026", label: "2026", count: 8 },
      ],
    },
  ];

  it("renders radios, not checkboxes, and reports one value", () => {
    const { container } = render(FilterPanel, { facets: years, selected: {} });
    const inputs = [...container.querySelectorAll("input")];
    expect(inputs.map((input) => input.type)).toEqual(["radio", "radio"]);
    // One group name shared, or the browser treats them as separate groups.
    expect(new Set(inputs.map((input) => input.name)).size).toBe(1);
  });

  it("replaces the selection instead of adding to it", async () => {
    const seen = [];
    const { container } = render(FilterPanel, {
      facets: years,
      selected: {},
      onchange: (next) => seen.push(next),
    });
    const inputs = [...container.querySelectorAll("input")];
    await fireEvent.click(inputs[0]);
    await fireEvent.click(inputs[1]);
    expect(seen[0]).toEqual({ year: ["2018"] });
    // A checkbox model would have said ["2018", "2026"], which the API behind
    // this facet cannot answer: a year is a from/to range, not a set.
    expect(seen[1]).toEqual({ year: ["2026"] });
  });

  it("clears when the active option is clicked, so there is a way back", async () => {
    const seen = [];
    const { container } = render(FilterPanel, {
      facets: years,
      selected: { year: ["2026"] },
      onchange: (next) => seen.push(next),
    });
    await fireEvent.click(container.querySelectorAll("input")[1]);
    expect(seen[0]).toEqual({});
  });

  it("draws the count as a bar behind the label, scaled to the group", () => {
    const { container } = render(FilterPanel, { facets: years, selected: {} });
    const bars = [...container.querySelectorAll(".option-bar")];
    expect(bars.map((bar) => bar.getAttribute("style"))).toEqual([
      expect.stringContaining("--w: 25%"),
      expect.stringContaining("--w: 100%"),
    ]);
  });

  it("prints the group's note, and nothing when there is none", () => {
    const { container } = render(FilterPanel, { facets: years, selected: {} });
    expect(container.querySelector(".facet-note").textContent).toBe(
      "one year, or none",
    );
    expect(container.querySelector(".filter-panel").textContent).not.toContain(
      "undefined",
    );
  });

  it("stays checkboxes, a plain list and note-free by default", () => {
    const { container } = render(FilterPanel, {
      facets: [
        {
          key: "kind",
          label: "Kind",
          options: [{ value: "update", label: "Update", count: 5 }],
        },
      ],
      selected: {},
    });
    expect(container.querySelector("input").type).toBe("checkbox");
    expect(container.querySelector(".option-bar")).toBeNull();
    expect(container.querySelector(".facet-note")).toBeNull();
  });
});

describe("BurstTimeline: orientation and caption", () => {
  const intervals = [
    { label: "2019", count: 2 },
    { label: "2020", count: 8 },
  ];

  it("draws horizontal bars when asked, with the caption it is given", () => {
    const { container } = render(BurstTimeline, {
      intervals,
      orientation: "horizontal",
      chartLabel: "passages per year",
    });
    expect(container.querySelector(".chart-bars.horizontal")).not.toBeNull();
    expect(container.querySelector(".chart-title").textContent).toBe(
      "passages per year",
    );
    // The largest bucket fills its track, and the axis it fills is width.
    const fill = container.querySelectorAll(".bar-fill")[1];
    expect(fill.getAttribute("style")).toContain("--pct: 100%");
  });

  it("defaults to vertical bars captioned 'recent bursts', as at 1.3.0", () => {
    const { container } = render(BurstTimeline, { intervals });
    expect(container.querySelector(".chart-bars.horizontal")).toBeNull();
    expect(container.querySelector(".chart-title").textContent).toBe(
      "recent bursts",
    );
  });

  it("prints a count per bar and a prose caption when asked (1.5.0)", () => {
    const caption = createRawSnippet(() => ({
      render: () =>
        `<span id="chart-note">daily updates from March 2018</span>`,
    }));
    const { container } = render(BurstTimeline, {
      intervals,
      orientation: "horizontal",
      showValues: true,
      caption,
    });
    const values = [...container.querySelectorAll(".bar-value")].map(
      (el) => el.textContent,
    );
    expect(values).toEqual(["2", "8"]);
    expect(container.querySelector("#chart-note").textContent).toContain(
      "March 2018",
    );
  });

  it("shows no value column or caption by default, as at 1.3.0 and 1.4.0", () => {
    const { container } = render(BurstTimeline, { intervals });
    expect(container.querySelectorAll(".bar-value").length).toBe(0);
    expect(container.querySelector(".chart-note")).toBeNull();
  });

  it("hides the caption when chartLabel is empty", () => {
    const { container } = render(BurstTimeline, { intervals, chartLabel: "" });
    expect(container.querySelector(".chart-title")).toBeNull();
    expect(container.querySelector(".chart-bars")).not.toBeNull();
  });
});
