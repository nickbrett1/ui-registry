#!/usr/bin/env node
/**
 * Generates `registry/theme.json` -- the *served* registry item for `@nb/theme`.
 *
 * Why this exists at all, given that `build:registry` is deliberately deferred
 * until there are blocks to inline: the served item must carry the theme's CSS
 * *inline* (`files[].content`), and the only other copy of that CSS is
 * `src/app.css`. Two hand-maintained copies of the token sheet is exactly the
 * drift this project exists to stop, so the second copy is generated, and
 * `tests/registry.test.js` fails when the generated file and `src/app.css`
 * disagree.
 *
 * Deliberately not the full `build:registry`: there is one item and nothing to
 * inline but the theme, so this is a one-file reader, not a registry builder.
 * When blocks arrive it is replaced by (or becomes the input to) the real build.
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
  // The file shape of a *served* item: content inlined, target = install path.
  files: (summary.files ?? []).map((file) => ({
    content: css,
    type: file.type,
    target: file.target,
  })),
  meta: {
    // Provenance + an integrity handle. The registry is versioned by immutability
    // of the document, so a digest is the cheapest way to say "this is v1".
    source: "src/app.css",
    sha256: digest,
    bytes: Buffer.byteLength(css, "utf8"),
  },
};

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(item, null, 2)}\n`, "utf8");
process.stdout.write(
  `registry/theme.json written (${item.meta.bytes} bytes of CSS, sha256 ${digest.slice(0, 12)}...)\n`,
);
