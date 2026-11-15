/**
 * The one list of what this registry serves, in the order the column shows it:
 * the five categories alphabetically, and the blocks inside each one.
 *
 * The sidebar, the overview page, the per-block pages and their previous/next
 * links all read this module. A second copy of the names is how a navigation
 * starts pointing at pages that are not there -- the sidebar and the route
 * handler would each be "right" about a different set.
 */
import index from "../../registry.json";
import published from "../../registry/versions/manifest.json";

// Five groups, alphabetically, because the column is a lookup and not a
// narrative any more. The previous order was the order a screen is built in --
// frame, figures, search, records, status -- which was worth reading when the
// demos were stacked on one page and the sequence was the argument. With each
// block on its own page there is no story to follow down the column, and the
// only order a reader can predict without learning our reasoning is A to Z.
// The label is still what the shapes *are*, in words someone would use looking
// for one: "figures & bars", not "numbers" -- "numbers" could mean a metric, a
// table of figures or a chart, which is the whole problem with a one-word
// category.
//
// `tests/smoke.test.js` pins both orders, so a new group dropped in the wrong
// place fails the build rather than quietly landing at the bottom.
export const groups = [
  {
    slug: "figures",
    label: "figures & bars",
    note: "one big number, a column of facts, a series over time, a ratio against a ceiling",
  },
  {
    slug: "frame",
    label: "page frame",
    note: "the bar across the top of a screen, and the screen that opens on one item",
  },
  {
    slug: "search",
    label: "search & results",
    note: "narrow the set down, then read the hits, or say why there are none",
  },
  {
    slug: "status",
    label: "status & logs",
    note: "what is running, what you can do to it, and what it said while doing it",
  },
  {
    slug: "records",
    label: "tables & forms",
    note: "rows of records you can scan, and the form that writes one",
  },
];

// The note is what the shape is for, in the words of someone who wants one.
// It is the only prose a block page carries besides the demo itself.
//
// The order here is the order of the column and the order of previous/next, so
// it must follow the groups above and be alphabetical inside each one. It was
// a curated order -- headline numbers, then the ratio, then the series, then
// the buckets -- which read as a sentence and was invisible to anyone who did
// not already know the shapes: hunting for `stat-strip` meant reading the
// column for it at the top of a group that starts with `bar-series`. A lookup
// is faster to scan in one predictable order than in a good one.
export const blocks = [
  { name: "bar-series", group: "figures", note: "a value per day, with today drawn as a projection" },
  { name: "burst-timeline", group: "figures", note: "activity in fixed time buckets, read across the day" },
  { name: "meter-strip", group: "figures", note: "how full something is, as a bar plus used / total" },
  { name: "stat-strip", group: "figures", note: "the row of big numbers at the top of a dashboard" },
  { name: "app-shell", group: "frame", note: "the bar pinned across the top of a screen: mark, title, section links, one action" },
  { name: "detail-panel", group: "frame", note: "one item opened: title, key facts in a grid, then prose" },
  { name: "empty-state", group: "search", note: "zero results, and which filter to drop to get some" },
  { name: "filter-panel", group: "search", note: "facet checkboxes down the side; behind a Filters button on a phone" },
  { name: "result-list", group: "search", note: "ranked hits: title, date, and the snippet the match came from" },
  { name: "action-list", group: "status", note: "one row per thing you operate, showing only the actions valid right now" },
  { name: "log-view", group: "status", note: "a job's own output, scrolling as it arrives, with Follow" },
  { name: "status-view", group: "status", note: "four columns: pending, done, stuck, blocked" },
  { name: "data-table", group: "records", note: "many records in aligned columns, numbers right-aligned" },
  { name: "request-form", group: "records", note: "the form that creates one of those records, with a message per failed field" },
];

export const inGroup = (slug) => blocks.filter((block) => block.group === slug);
export const groupOf = (slug) => groups.find((group) => group.slug === slug);
export const blockByName = (name) => blocks.find((block) => block.name === name);

// Previous / next, walking the same order the sidebar walks. A reader who
// finishes one shape should not have to go back to the index to find the next.
export function neighbours(name) {
  const i = blocks.findIndex((block) => block.name === name);
  if (i < 0) return { prev: null, next: null };
  return { prev: blocks[i - 1] ?? null, next: blocks[i + 1] ?? null };
}

// The count is *counted* from the catalogue, never written down: this page once
// said "eleven" while the registry served fourteen.
export const publishedBlockCount = index.items.filter(
  (item) => item.type === "registry:block",
).length;

// The release being served is *read*, not written down: importing the published
// manifest means the header cannot advertise a version the registry does not
// serve, which is the one thing a registry page must not get wrong.
export const versions = [...new Set(published.items.map((item) => item.version))];
export const latestVersion = versions.sort((a, b) => {
  const [x, y] = [a.split(".").map(Number), b.split(".").map(Number)];
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
})[versions.length - 1];

// What each token is *for*, in the words a consumer would use. A swatch with no
// label is decoration; a swatch labelled "--warn -- waiting or pending" is the
// reason a block can be re-skinned without being read.
export const palette = [
  { token: "bg", means: "the ground; every surface is a tint of it" },
  { token: "ink", means: "body text" },
  { token: "ink-strong", means: "the strongest ink: a heading, or the thing under the pointer" },
  { token: "accent", means: "links, the active tab, anything you can press" },
  { token: "ok", means: "succeeded, matched, done" },
  { token: "warn", means: "waiting, pending, slow" },
  { token: "bad", means: "failed, blocked" },
  { token: "mark", means: "the matched words inside a snippet" },
];
