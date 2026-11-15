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
    // One distinctive string per block family: the shell's title, a stat label,
    // a status lane, the empty state's cause-aware copy, and a form constraint.
    const words = [
      ["app-shell", "data-download"],
      ["stat-strip", "Requests today"],
      ["status-view", "Stuck"],
      ["empty-state", "No matches for active filters"],
      ["request-form", "must be a date"],
    ];
    for (const [name, text] of words) {
      const { container, unmount } = render(Demo, { name });
      expect(container.textContent, `${name} lost "${text}"`).toContain(text);
      unmount();
    }
  });
});
