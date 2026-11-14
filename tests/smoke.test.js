import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Page from "../src/routes/+page.svelte";
import { GET } from "../src/routes/health/+server.js";

describe("generated app smoke test", () => {
  it("renders the registry landing page", () => {
    const { container } = render(Page);
    // By name, not "the only h1": `detail-panel` legitimately renders its own h1
    // in its sample, since a detail page's title is the page's title.
    expect(screen.getByRole("heading", { level: 1, name: "@nb UI Registry" })).toBeInTheDocument();
    // Scoped to the page header: the app-shell sample also says it, as a subtitle.
    expect(container.querySelector("header .micro").textContent).toContain("house design system");
  });

  it("says what the registry is, in three plain facts", () => {
    render(Page);
    for (const term of ["one theme", "nine blocks", "pinned by version"]) {
      expect(screen.getByText(term)).toBeInTheDocument();
    }
  });

  it("labels every palette variable with what it is for", () => {
    const { container } = render(Page);
    for (const token of ["bg", "ink", "accent", "ok", "warn", "bad", "mark"]) {
      expect(container.textContent).toContain(`--${token}`);
    }
    // The old "tokens at work" panel showed five pills with no explanation; the
    // labels are the whole point now, so pin one that cannot be guessed.
    expect(container.textContent).toContain("the matched words inside a snippet");
  });

  it("health endpoint returns ok", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
