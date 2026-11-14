import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import Page from "../src/routes/+page.svelte";
import { GET } from "../src/routes/health/+server.js";

describe("generated app smoke test", () => {
  it("renders the registry landing page", () => {
    render(Page);
    expect(screen.getByText("@nb UI Registry")).toBeInTheDocument();
    expect(screen.getByText("house design system")).toBeInTheDocument();
    expect(screen.getByText("consumer install")).toBeInTheDocument();
  });
  it("health endpoint returns ok", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
