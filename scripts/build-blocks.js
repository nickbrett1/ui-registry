#!/usr/bin/env node
/**
 * Generates `registry/<name>.json` for each block in `blocks/`.
 *
 * Each block is a Svelte 5 component adhering to the house design system:
 *   - No hardcoded hex colours outside theme tokens (asserted here).
 *   - Self-contained in `src/lib/components/nb/<Name>.svelte`.
 *   - Conforms to shadcn-svelte's `registry-item.json` schema.
 *
 * Writes both:
 *   1. Working copies: `registry/<name>.json`
 *   2. Catalogue entries in `registry.json`
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const BLOCKS_DIR = path.join(ROOT, "blocks");
const REGISTRY_DIR = path.join(ROOT, "registry");
const INDEX_FILE = path.join(ROOT, "registry.json");

const BLOCKS = [
  {
    name: "app-shell",
    title: "App Shell",
    component: "AppShell.svelte",
    description:
      "Sticky top bar on an opaque ground, wordmark, a top-level tab nav with aria-current (links or router buttons), back pill on non-root views, 68rem main, and footer strip. The house application frame.",
  },
  {
    name: "stat-strip",
    title: "Stat Strip",
    component: "StatStrip.svelte",
    description:
      "KPI summary cards (label, big tabular-figure value, sub-line) in a responsive grid. Lifted from deepseek-balance and stratechery-search.",
  },
  {
    name: "result-list",
    title: "Result List",
    component: "ResultList.svelte",
    description:
      "Ranked entity list with title, meta, status pill, and a progressive fold disclosure. Generalised from stratechery-search.",
  },
  {
    name: "filter-panel",
    title: "Filter Panel",
    component: "FilterPanel.svelte",
    description:
      "Facet filter card on desktop; chip row and bottom sheet under 600px. Replaces custom filter layouts.",
  },
  {
    name: "empty-state",
    title: "Empty State",
    component: "EmptyState.svelte",
    description:
      "Cause-aware zero-result card: distinguishes narrow filters (with clear-filters action) from misspelled queries.",
  },
  {
    name: "status-view",
    title: "Status View",
    component: "StatusView.svelte",
    description:
      "Four-card status lanes (pending, done, stuck, blocked) with counts in the head and pill badges. Lifted from data-download §8.",
  },
  {
    name: "detail-panel",
    title: "Detail Panel",
    component: "DetailPanel.svelte",
    description:
      "Entity inspection card: title, status pill, two-column metadata grid, prose body, and history.back() navigation.",
  },
  {
    name: "burst-timeline",
    title: "Burst Timeline",
    component: "BurstTimeline.svelte",
    description:
      "Interval burst sparkline chart + historical audit grid with labelled comparison columns ('Explains').",
  },
  {
    name: "bar-series",
    title: "Bar Series",
    component: "BarSeries.svelte",
    description:
      "A labelled bar chart with a computed value axis, per-bar display strings, and a dashed projection bar. The measured-value counterpart to burst-timeline's sparkline. Lifted from deepseek-balance's daily spend, usage and cost charts.",
  },
  {
    name: "data-table",
    title: "Data Table",
    component: "DataTable.svelte",
    description:
      "Column-aligned records in a card: header labels, right-aligned tabular numerics, hairline rows, and a cell slot. Wraps per record under 600px. Lifted from data-download's request book and plan-type schema.",
  },
  {
    name: "request-form",
    title: "Request Form",
    component: "RequestForm.svelte",
    description:
      "Schema-driven input form with constraint error presentation (one message per failed rule). Lifted from data-download §7.8.",
  },
  {
    name: "meter-strip",
    title: "Meter Strip",
    component: "MeterStrip.svelte",
    description:
      "A capacity bar (used against a ceiling, as a filled bar with a role=progressbar) over a row of figures. Lifted from devdash, where the same strip is both the page's header and the NAS dashboard's iframe.",
  },
  {
    name: "action-list",
    title: "Action List",
    component: "ActionList.svelte",
    description:
      "One row per thing you operate: name, state pill, metadata badges, and the actions that are valid for that row right now. Per-row slots for the buttons, a note and an aside. Lifted from devdash's project list.",
  },
  {
    name: "log-view",
    title: "Log View",
    component: "LogView.svelte",
    description:
      "A job's output in a panel: head with a state pill, an optional notice, a monospace pane that scrolls itself, and an action row. The pane is bindable so the caller can follow its tail. Lifted from devdash's build/provision log.",
  },
];

const RAW_HEX_RE = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;

async function build() {
  await mkdir(REGISTRY_DIR, { recursive: true });

  const catalogue = JSON.parse(await readFile(INDEX_FILE, "utf8"));
  const nonBlockItems = (catalogue.items ?? []).filter(
    (item) => item.type !== "registry:block",
  );

  const builtBlockItems = [];

  for (const block of BLOCKS) {
    const srcPath = path.join(BLOCKS_DIR, block.name, block.component);
    const content = await readFile(srcPath, "utf8");

    // Guard against hardcoded hex colours in component styles (theme tokens only).
    // Allow `#` inside CSS selectors or comments, but reject inside declaration values.
    const styleMatch = content.match(/<style[\s\S]*?>([\s\S]*?)<\/style>/);
    if (styleMatch) {
      const styleBody = styleMatch[1].replace(/\/\*[\s\S]*?\*\//g, "");
      const hexes = styleBody.match(RAW_HEX_RE);
      if (hexes && hexes.length > 0) {
        throw new Error(
          `Block ${block.name} contains hardcoded hex colours in <style>: ${hexes.join(", ")}. Use var(--...) tokens instead.`,
        );
      }
    }

    const digest = createHash("sha256").update(content, "utf8").digest("hex");
    // **Relative to the components alias, not to the project root.**
    // `registry:file` targets are resolved as `config.aliases.components + target`,
    // so `src/lib/components/nb/AppShell.svelte` installed itself at
    // `src/lib/components/src/lib/components/nb/AppShell.svelte` -- measured by
    // running the pinned CLI, not by reading its docs. The alias is the anchor.
    const targetPath = `nb/${block.component}`;

    const item = {
      $schema: "https://shadcn-svelte.com/schema/registry-item.json",
      name: block.name,
      title: block.title,
      type: "registry:block",
      author: "nickbrett1 <https://github.com/nickbrett1>",
      description: block.description,
      dependencies: [],
      devDependencies: [],
      registryDependencies: [],
      files: [
        {
          type: "registry:file",
          target: targetPath,
          content,
        },
      ],
      meta: {
        source: path.relative(ROOT, srcPath),
        sha256: digest,
        bytes: Buffer.byteLength(content, "utf8"),
      },
    };

    const outPath = path.join(REGISTRY_DIR, `${block.name}.json`);
    await writeFile(outPath, `${JSON.stringify(item, null, 2)}\n`, "utf8");

    builtBlockItems.push({
      name: block.name,
      title: block.title,
      type: "registry:block",
      author: "nickbrett1 <https://github.com/nickbrett1>",
      description: block.description,
      dependencies: [],
      devDependencies: [],
      registryDependencies: [],
      files: [
        {
          type: "registry:file",
          path: path.relative(ROOT, srcPath),
          target: targetPath,
        },
      ],
    });

    process.stdout.write(`  built registry/${block.name}.json\n`);
  }

  // Update catalogue registry.json
  catalogue.items = [...nonBlockItems, ...builtBlockItems];
  await writeFile(
    INDEX_FILE,
    `${JSON.stringify(catalogue, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(
    `registry.json updated with ${builtBlockItems.length} blocks\n`,
  );
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
