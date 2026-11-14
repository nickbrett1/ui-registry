import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { render } from "@testing-library/svelte";
import DataTable from "./fixtures/DataTableSample.svelte";

/**
 * `data-table` (1.8.0) came from converting data-download: a request book of six
 * aligned columns and a plan-type parameter schema of four. jsdom has no layout,
 * so the things under test are the ones that are *structure* — labels belong to
 * columns, one row per record, cells are the caller's — plus a source-text test
 * for the one rule that is pure CSS (the header disappears below 600px).
 */
const source = await readFile(
  path.join(process.cwd(), "blocks", "data-table", "DataTable.svelte"),
  "utf8",
);

const columns = [
  { label: "request", width: "minmax(9rem, 1.3fr)" },
  { label: "estimate", align: "end" },
];

const items = [
  { id: "req_1", state: "succeeded", estimate: "$0.0412" },
  { id: "req_2", state: "failed", estimate: "$0.0009" },
];

// `DataTableSample` is the consumer: it hands the block the same cells a page
// would (an id and a tabular number), so these tests exercise the snippet
// contract rather than a raw HTML string.
function table(props = {}) {
  return render(DataTable, { columns, items, ...props });
}

describe("DataTable", () => {
  it("puts the labels in a header row, once", () => {
    const { container } = table();
    const labels = [...container.querySelectorAll(".col-label")].map((n) =>
      n.textContent.trim(),
    );
    expect(labels).toEqual(["request", "estimate"]);
    expect(container.querySelectorAll(".tbl-head")).toHaveLength(1);
  });

  it("renders one row per record and nothing for the header", () => {
    const { container } = table();
    expect(container.querySelectorAll(".tbl-row")).toHaveLength(2);
  });

  it("gives the caller the cells, and the caller's markup is what renders", () => {
    const { container } = table();
    const first = container.querySelector(".tbl-row");
    const cells = [...first.children];
    expect(cells).toHaveLength(2);
    expect(cells[0].textContent).toBe("req_1");
    expect(cells[1].textContent).toBe("$0.0412");
  });

  it("says so when there is nothing, rather than drawing an empty card", () => {
    const { container } = table({ items: [], emptyMessage: "No requests yet." });
    expect(container.textContent).toContain("No requests yet.");
    expect(container.querySelector(".tbl-head")).toBeNull();
  });

  it("counts the records in the title, which is a heading when asked", () => {
    const { container } = table({ title: "The request book", titleTag: "h3" });
    const heading = container.querySelector("h3");
    expect(heading?.textContent.replace(/\s+/g, " ").trim()).toBe(
      "The request book (2)",
    );
  });

  it("keeps its own title out of the document when none is asked for", () => {
    const { container } = table();
    expect(container.querySelector(".section-title")).toBeNull();
  });

  it("has a width template, so a numeric column does not fight an id", () => {
    const { container } = table();
    expect(container.querySelector(".tbl").getAttribute("style")).toContain(
      "minmax(9rem, 1.3fr) 7rem",
    );
  });

  // The one rule jsdom cannot see. A six-column table at 390px is either a
  // horizontal scrollbar or a truncated id; the block drops the header and wraps
  // each record instead, and that decision lives in the stylesheet.
  it("drops the header and wraps a record under 600px", () => {
    const mobile = /@media \(max-width: 600px\) \{[\s\S]*?\n  \}/.exec(source)?.[0];
    expect(mobile).toBeTruthy();
    expect(mobile).toContain(".tbl-head");
    expect(mobile).toContain("display: none");
    expect(mobile).toContain("flex-wrap: wrap");
    expect(mobile).toContain(".num");
    expect(mobile).toContain("text-align: left");
  });
});
