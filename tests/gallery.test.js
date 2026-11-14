import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import Page from "../src/routes/+page.svelte";

/**
 * The landing page *is* the gallery: the eleven blocks are imported from
 * `blocks/` — the same bytes `registry.json` publishes — and rendered inline.
 *
 * `tests/blocks.test.js` proves they compile; this proves they *render*, which
 * is where an undefined prop or a missing `$derived` shows up.
 */
describe("the blocks on the landing page", () => {
  it("renders all eleven blocks", () => {
    const { container } = render(Page);
    const sections = container.querySelectorAll("section.block");
    expect(sections.length).toBe(11);
  });

  it("names every block the registry publishes", () => {
    const { container } = render(Page);
    const text = container.textContent;
    for (const name of [
      "app-shell",
      "stat-strip",
      "result-list",
      "filter-panel",
      "empty-state",
      "status-view",
      "detail-panel",
      "burst-timeline",
      "bar-series",
      "data-table",
      "request-form",
    ]) {
      expect(text).toContain(name);
    }
  });

  it("gives each block a heading and an anchor, so the page can be browsed", () => {
    const { container } = render(Page);
    for (const name of [
      "app-shell",
      "stat-strip",
      "result-list",
      "filter-panel",
      "empty-state",
      "status-view",
      "detail-panel",
      "burst-timeline",
      "bar-series",
      "data-table",
      "request-form",
    ]) {
      const section = container.querySelector(`section.block#${name}`);
      expect(section).not.toBeNull();
      // A heading, not a styled div: on a page this long the outline is the
      // navigation, and a <code> label is not a heading.
      expect(section.querySelector("h2").textContent).toContain(name);
      expect(container.querySelector(`a[href="#${name}"]`)).not.toBeNull();
    }
  });

  it("renders the blocks' own words, not placeholders", () => {
    const { container } = render(Page);
    const text = container.textContent;
    // One distinctive string per block family: the shell's title, a stat label,
    // a status lane, the empty state's cause-aware copy, and a form constraint.
    expect(text).toContain("data-download");
    expect(text).toContain("Requests today");
    expect(text).toContain("Stuck");
    expect(text).toContain("No matches for active filters");
    expect(text).toContain("must be a date");
  });
});
