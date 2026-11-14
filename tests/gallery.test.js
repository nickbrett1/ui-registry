import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import Gallery from "../src/routes/blocks/+page.svelte";

/**
 * The gallery imports all nine blocks from `blocks/` — the same bytes
 * `registry.json` publishes — so rendering it is a real check that nine
 * published items are nine working components rather than nine JSON documents.
 *
 * `tests/blocks.test.js` proves they compile; this proves they *render*, which
 * is where an undefined prop or a missing `$derived` shows up.
 */
describe("the block gallery", () => {
  it("renders all nine blocks", () => {
    const { container } = render(Gallery);
    const sections = container.querySelectorAll("section.block");
    expect(sections.length).toBe(9);
  });

  it("names every block the registry publishes", () => {
    const { container } = render(Gallery);
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
      "request-form",
    ]) {
      expect(text).toContain(name);
    }
  });

  it("renders the blocks' own words, not placeholders", () => {
    const { container } = render(Gallery);
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
