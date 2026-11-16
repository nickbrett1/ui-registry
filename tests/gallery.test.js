import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import Demo from "../src/lib/BlockDemo.svelte";
import { blocks } from "../src/lib/catalogue.js";
import index from "../registry.json";

// The published block list is the source of truth, not a literal: a list here
// that happens to match today is exactly what let the generator's copy of the
// block names drift in genproj. `registry.json` is generated from `blocks/`, so
// this is the one place that says "every published block has a page".
const publishedBlocks = index.items
  .filter((item) => item.type === "registry:block")
  .map((item) => item.name);

/**
 * Each block now has its own page; the demo component is what that page renders.
 * `tests/blocks.test.js` proves the blocks compile; this proves they *render*,
 * which is where an undefined prop or a missing `$derived` shows up.
 */
describe("the block demos", () => {
  it("every published block has a demo, and the catalogue agrees", () => {
    expect(blocks.map((block) => block.name).sort()).toEqual(
      [...publishedBlocks].sort(),
    );
  });

  it("renders each block with its sample data", () => {
    for (const name of publishedBlocks) {
      const { container, unmount } = render(Demo, { name });
      // A block that renders nothing is the failure this catches: an empty
      // switch arm, or a prop the block now ignores.
      expect(
        container.textContent.trim().length,
        `${name} rendered nothing`,
      ).toBeGreaterThan(0);
      unmount();
    }
  });

  it("renders the blocks' own words, not placeholders", () => {
    // One distinctive string per *published* block, not per family. A demo that
    // passes a prop the block does not declare gets the block's default -- an
    // empty array -- and renders its "no data" copy instead. Nothing errors:
    // `bar-series` shipped showing "No data in this range." because the demo
    // said `{spendBars}` and the prop is `bars`. Only reading the output
    // catches that, so every block is named here with a string it can only
    // produce when its data arrived.
    const words = {
      "action-list": "devdash",
      "app-shell": "data-download",
      "bar-series": "¥27.40",
      "burst-timeline": "Balance history",
      "data-table": "req_9f2a41c8",
      "detail-panel": "Intervals and the scheduler that keeps them",
      "device-mirror": "Counting down",
      "command-pad": "Cancel",
      "confirm-prompt": "start Bathtime instead",
      "message-bar": "Message for the panel",
      "empty-state": "No matches for active filters",
      "filter-panel": "Run",
      "log-view": "docker compose up -d --build",
      "meter-strip": "2.1 GB",
      "request-form": "must be a date",
      "result-list": "Interval scheduling under load",
      "stat-strip": "Requests today",
      "status-view": "Stuck",
    };
    // Every published block must be in the table, so a new block cannot be
    // added without someone deciding what it is supposed to render.
    expect(Object.keys(words).sort()).toEqual([...publishedBlocks].sort());

    for (const [name, text] of Object.entries(words)) {
      const { container, unmount } = render(Demo, { name });
      expect(container.textContent, `${name} lost "${text}"`).toContain(text);
      unmount();
    }
  });
});
