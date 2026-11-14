import { describe, expect, it } from "vitest";
import { render } from "@testing-library/svelte";
import MeterStrip from "../blocks/meter-strip/MeterStrip.svelte";
import ActionList from "../blocks/action-list/ActionList.svelte";
import LogView from "../blocks/log-view/LogView.svelte";

/**
 * The three blocks devdash needed. Each exists because that page was doing the
 * job inline — and doing it differently from everything else in the estate —
 * so these pin the parts that made it worth extracting rather than the markup.
 *
 * The per-row snippets (`actions`, `note`, `aside`) are exercised by the gallery
 * page and by the app that consumes them; a snippet is a template, and passing a
 * plain JS function here would test a shape no caller uses.
 */
describe("meter-strip", () => {
  const figures = [
    { value: "4.2 GB", label: "devcontainers" },
    { value: "3", label: "running" },
  ];

  it("draws the ratio as a bar, with the reading beside it", () => {
    const { container } = render(MeterStrip, {
      label: "VM memory",
      used: 2,
      total: 8,
      usedLabel: "2.1 GB",
      totalLabel: "8 GB",
      figures,
    });

    const bar = container.querySelector('[role="progressbar"]');
    expect(bar.getAttribute("aria-valuenow")).toBe("2");
    expect(bar.getAttribute("aria-valuemax")).toBe("8");
    expect(bar.getAttribute("aria-label")).toBe("VM memory");
    // 25%, not "2 / 8" spelled out: the bar is the fact.
    expect(bar.querySelector("span").style.width).toBe("25%");
    expect(container.textContent).toContain("2.1 GB / 8 GB");
    expect(container.textContent).toContain("devcontainers");
  });

  it("clamps a total it cannot divide by, rather than rendering NaN", () => {
    const { container } = render(MeterStrip, { used: 4, total: 0 });
    expect(container.querySelector('[role="progressbar"] span').style.width).toBe("0%");
  });

  it("takes the tone on the bar, so 'nearly full' is visible", () => {
    const { container } = render(MeterStrip, { used: 7.6, total: 8, tone: "warn" });
    const bar = container.querySelector('[role="progressbar"] span');
    expect(bar.classList).toContain("warn");
    expect(bar.style.width).toBe("95%");
  });
});

describe("action-list", () => {
  const items = [
    {
      name: "devdash",
      state: "running",
      tone: "ok",
      meta: "312 MB",
      badges: [{ label: "window open" }],
    },
    { name: "data-scout", state: "stopped" },
  ];

  it("gives every row its own state, metadata and badges", () => {
    const { container } = render(ActionList, { items });
    const rows = container.querySelectorAll("li.row");
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector(".name").textContent).toBe("devdash");
    expect(rows[0].querySelector(".pill").textContent).toBe("running");
    expect(rows[0].querySelector(".meta").textContent).toBe("312 MB");
    expect(rows[0].querySelector(".badge").textContent).toBe("window open");
    // A row with no badges renders none, rather than an empty strip.
    expect(rows[1].querySelector(".badges")).toBeNull();
    expect(rows[1].querySelector(".meta")).toBeNull();
  });

  it("separates rows with hairlines, not with cards inside cards", () => {
    const { container } = render(ActionList, { items });
    const rows = container.querySelectorAll("li.row");
    expect(rows[0].className).not.toContain("border-top");
    expect(rows[1].className).toContain("border-top");
  });

  it("says what an empty list means", () => {
    const { container } = render(ActionList, { items: [], emptyMessage: "No projects." });
    expect(container.textContent).toContain("No projects.");
    expect(container.querySelector("li.row")).toBeNull();
  });
});

describe("log-view", () => {
  it("renders the lines in one pane", () => {
    const { container } = render(LogView, {
      title: "provision data-scout",
      state: "running",
      tone: "running",
      lines: ["line one", "line two"],
    });
    const pre = container.querySelector("pre");
    expect(pre.textContent).toBe("line one\nline two");
    // Full-screen views put this pane in a fixed box; the block's pane is the
    // scroll container so the head and the buttons stay put.
    expect(container.querySelector(".log-view .head")).not.toBeNull();
  });

  it("waits rather than showing an empty black box", () => {
    const { container } = render(LogView, { title: "build", emptyMessage: "Waiting for output…" });
    expect(container.querySelector("pre")).toBeNull();
    expect(container.textContent).toContain("Waiting for output…");
  });

  it("shows the state it was given, in the block's own vocabulary", () => {
    const { container } = render(LogView, { title: "build", state: "failed", tone: "failed" });
    const pill = container.querySelector(".pill");
    expect(pill.textContent).toBe("failed");
    expect(pill.classList).toContain("failed");
  });
});
