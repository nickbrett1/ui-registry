#!/usr/bin/env node
/**
 * Generates `registry/theme.json` -- the *served* registry item for `@nb/theme`.
 *
 * **Why the item is `cssVars` + `css` and not a file with a `target`** (2026-11-14,
 * established by running `shadcn-svelte@1.8.1`, not by reading its docs):
 *
 *   `shadcn-svelte` resolves a `registry:theme` item's `files[].target` against
 *   the *basename of the consumer's tailwind CSS file, used as a directory*:
 *
 *       os(config, "registry:theme") -> path.basename(config.resolvedPaths.tailwindCss)
 *       path.resolve(that, file.target)
 *
 *   so `target: "src/nb-theme.css"` in a project whose stylesheet is `src/app.css`
 *   writes `<cwd>/app.css/src/nb-theme.css` -- a directory named `app.css`
 *   containing a file nothing imports. A theme item *has no install path*.
 *
 *   What it has instead is a payload the CLI merges into the consumer's own
 *   stylesheet with PostCSS: `cssVars` (custom properties) and `css` (a raw CSS
 *   string). That is the better outcome anyway -- the consumer keeps its
 *   `@import "tailwindcss"`, needs no extra import line, and the merge is the
 *   CLI's own code rather than an assumption about it.
 *
 * So `src/app.css` is *split*: its `:root` block becomes `cssVars.theme`, and
 * every rule after it becomes `css`. Both halves are generated from the one
 * source, and `tests/registry.test.js` fails if they drift from it.
 *
 * `cssVars.theme` is the Tailwind v4 spelling (`@theme`); a v3 consumer would
 * need `light`/`dark` instead, which is not this estate's problem yet.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const THEME_SOURCE = path.join(ROOT, "src", "app.css");
const INDEX = path.join(ROOT, "registry.json");
const OUT = path.join(ROOT, "registry", "theme.json");

const css = await readFile(THEME_SOURCE, "utf8");
const index = JSON.parse(await readFile(INDEX, "utf8"));

const summary = index.items.find((item) => item.name === "theme");
if (!summary) {
  throw new Error('registry.json has no item named "theme"');
}

const { cssVars, rules, cssObject } = splitThemeSheet(css);

const digest = createHash("sha256").update(css, "utf8").digest("hex");

const item = {
  $schema: "https://shadcn-svelte.com/schema/registry-item.json",
  name: summary.name,
  title: summary.title,
  type: summary.type,
  author: summary.author,
  description: summary.description,
  dependencies: summary.dependencies ?? [],
  devDependencies: summary.devDependencies ?? [],
  registryDependencies: summary.registryDependencies ?? [],
  // The tokens: what a theme item is *for*. Merged into the consumer's
  // stylesheet, so there is deliberately no `files` array and no `target`.
  cssVars: { theme: cssVars },
  // The grammar that cannot be expressed as variables: `.card`, `.micro`,
  // `.pill`, the row grids, the two media queries. The CLI's schema wants this
  // as an **object** (`{selector: {property: value}}`, nested for at-rules) --
  // handing it a CSS *string* fails with `Invalid input` at `["css"]`, which is
  // how this shape was found.
  css: cssObject,
  meta: {
    // Provenance + an integrity handle. The registry is versioned by immutability
    // of the document, so a digest is the cheapest way to say "this is v1.2".
    source: "src/app.css",
    sha256: digest,
    bytes: Buffer.byteLength(css, "utf8"),
    variables: Object.keys(cssVars).length,
  },
};

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(item, null, 2)}\n`, "utf8");
process.stdout.write(
  `registry/theme.json written (${item.meta.variables} variables, ` +
    `${Buffer.byteLength(rules, "utf8")} bytes of rules, sha256 ${digest.slice(0, 12)}...)\n`,
);

/**
 * Split the sheet into its `:root` custom properties and everything else.
 *
 * A hand-rolled splitter, not a CSS parser: the source is one file this repo
 * owns, the shape is one `:root` block followed by top-level rules, and the
 * failure mode of getting it wrong is a test failure rather than a wrong
 * published design system (`tests/registry.test.js` re-derives both halves and
 * asserts that nothing was dropped).
 */
export function splitThemeSheet(text) {
  const rootStart = text.search(/^:root\s*\{/m);
  if (rootStart === -1) throw new Error("src/app.css has no :root block to split");

  const open = text.indexOf("{", rootStart);
  let depth = 0;
  let close = -1;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) throw new Error("unbalanced braces in src/app.css :root block");

  const declarations = text.slice(open + 1, close);
  const rules = text.slice(close + 1).trim();

  const cssVars = {};
  const other = [];
  for (const declaration of declarations.replace(/\/\*[\s\S]*?\*\//g, "").split(";")) {
    const trimmed = declaration.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) throw new Error(`malformed declaration in :root: "${trimmed}"`);
    const name = trimmed.slice(0, colon).trim();
    // Multi-line values (`--sans`, `--mono`) are one value: collapse the
    // whitespace so the published item is a stable single line.
    const value = trimmed.slice(colon + 1).trim().replace(/\s+/g, " ");
    if (name.startsWith("--")) cssVars[name] = value;
    // `color-scheme: dark` is a real declaration, not a custom property. It is
    // not a token, so it cannot travel in `cssVars` -- but it must not be
    // dropped either, or a fresh project goes back to light scrollbars and
    // light form controls against a dark ground.
    else other.push(`${name}: ${value};`);
  }

  if (Object.keys(cssVars).length === 0) throw new Error(":root block produced no variables");
  if (!rules) throw new Error("src/app.css has no rules after :root");

  const rest = other.length > 0 ? `:root {\n${other.map((line) => `  ${line}`).join("\n")}\n}\n\n${rules}` : rules;

  return { cssVars, rules: rest, cssObject: parseRules(rest) };
}

/**
 * Parse the rule half of the sheet into the object form the item schema wants.
 *
 *   selector, selector { prop: value; prop: value }
 *     ->  { "selector, selector": { prop: "value", prop: "value" } }
 *
 * One level of at-rule nesting is supported (`@media { selector { … } }`), which
 * is all this stylesheet has and all the schema's recursive shape needs.
 * Comments are dropped. A hand-rolled parser again, for the same reason as
 * `splitThemeSheet`: one file, one shape, and the drift test fails rather than a
 * design system shipping wrong.
 */
export function parseRules(text) {
  const out = {};
  let i = 0;

  while (i < text.length) {
    // skip comments and whitespace between blocks
    while (i < text.length) {
      if (/\s/.test(text[i])) i += 1;
      else if (text.startsWith("/*", i)) i = text.indexOf("*/", i) + 2 || text.length;
      else break;
    }
    if (i >= text.length) break;

    const open = text.indexOf("{", i);
    if (open === -1) break;
    const header = text.slice(i, open).trim().replace(/\s+/g, " ");
    let depth = 0;
    let close = -1;
    for (let j = open; j < text.length; j += 1) {
      if (text[j] === "{") depth += 1;
      else if (text[j] === "}") {
        depth -= 1;
        if (depth === 0) {
          close = j;
          break;
        }
      }
    }
    if (close === -1) throw new Error(`unbalanced braces after "${header}"`);

    const body = text.slice(open + 1, close);
    if (header.startsWith("@")) {
      // An at-rule whose body is rules rather than declarations.
      out[header] = parseRules(body);
    } else {
      const declarations = {};
      for (const declaration of body.replace(/\/\*[\s\S]*?\*\//g, "").split(";")) {
        const trimmed = declaration.trim();
        if (!trimmed) continue;
        const colon = trimmed.indexOf(":");
        if (colon === -1) throw new Error(`malformed declaration under "${header}": "${trimmed}"`);
        declarations[trimmed.slice(0, colon).trim()] = trimmed.slice(colon + 1).trim().replace(/\s+/g, " ");
      }
      out[header] = declarations;
    }
    i = close + 1;
  }

  if (Object.keys(out).length === 0) throw new Error("no rule blocks were parsed");
  return out;
}
