import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { render } from "@testing-library/svelte";
import BarSeries from "../blocks/bar-series/BarSeries.svelte";

/**
 * `bar-series` (1.9.0) came from deepseek-balance's three daily charts. jsdom
 * cannot measure a `<rect>`, so the tests here are about *claims*: which bars
 * exist, which one is drawn as a projection, what the axis says in the caller's
 * unit, and that a blank day keeps its slot.
 */
const source = await readFile(
  path.join(process.cwd(), "blocks", "bar-series", "BarSeries.svelte"),
  "utf8",
);

const bars = [
  { label: "11-01", value: 18.4, display: "¥18.40" },
  { label: "11-02", value: 24.1, display: "¥24.10" },
  { label: "11-03", value: null },
  { label: "11-04", value: 27.4, display: "¥27.40", projected: true },
];

describe("BarSeries", () => {
  it("draws one bar per measured value and none for the blank day", () => {
    const { container } = render(BarSeries, { bars });
    expect(container.querySelectorAll("rect.bar")).toHaveLength(3);
  });

  it("marks the projection as an outline, not a measurement", () => {
    const { container } = render(BarSeries, { bars });
    const projected = container.querySelectorAll("rect.bar.projected");
    expect(projected).toHaveLength(1);
    expect(projected[0].querySelector("title").textContent).toContain(
      "projected",
    );
    // The rule is CSS, so it is asserted in the source: a hollow, dashed bar.
    expect(source).toMatch(/\.bar\.projected\s*\{[^}]*fill:\s*transparent/);
    expect(source).toMatch(/\.bar\.projected\s*\{[^}]*stroke-dasharray/);
  });

  it("lets the caller format both the tooltip and the axis", () => {
    const { container } = render(BarSeries, {
      bars: [
        { label: "11-01", value: 135, display: "2h 15m" },
        { label: "11-02", value: 45, display: "45m" },
      ],
      axisFormat: (value) => `${value}m`,
    });
    const text = container.textContent;
    // The axis is in the caller's unit and lands on round numbers: a maximum of
    // 135 minutes gets a 0/50/100/150 scale, not 37.5 / 75 / 112.5.
    expect(text).toContain("150m");
    expect(text).not.toContain("37.5");
    // The label is the caller's string, not the number.
    expect(text).toContain("2h 15m");
  });

  it("keeps the blank day's slot, so the axis does not close the gap", () => {
    const { container } = render(BarSeries, { bars });
    // Every bar is positioned from its index; index 2 has no rect but the
    // projected bar at index 3 must not slide into its place.
    const xs = [...container.querySelectorAll("rect.bar")].map((r) =>
      Number(r.getAttribute("x")),
    );
    expect(xs[2] - xs[1]).toBeGreaterThan(xs[1] - xs[0] + 1);
  });

  it("says so when the range holds nothing", () => {
    const { container } = render(BarSeries, { bars: [] });
    expect(container.textContent).toContain("No data in this range");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("takes its colour from the theme, never a literal", () => {
    // The gallery is the only place these render outside an app, so a raw hex
    // here would be a block that cannot be re-skinned.
    const styles = source.match(/<style[\s\S]*?<\/style>/)[0];
    expect(styles).not.toMatch(/#(?:[0-9a-fA-F]{3}){1,2}\b/);
    expect(styles).toContain("var(--accent)");
  });
});
