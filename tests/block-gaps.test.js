import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";

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
describe("AppShell: the slots a real app needs", () => {
  const mark = createRawSnippet(() => ({
    render: () => `<svg id="brand-mark"></svg>`,
  }));
  const actions = createRawSnippet(() => ({
    render: () => `<nav id="primary-nav"><a href="/runs">runs</a></nav>`,
  }));

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
