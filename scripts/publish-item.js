#!/usr/bin/env node
/**
 * Publishes `registry/<name>.json` as an immutable version, together with the
 * versioned index the Svelte CLI fetches.
 *
 *   npm run publish:item theme 1.0.0
 *
 * Design note §3.5: "a design system that mutates under a live project is worse
 * than a stale one", and §3.6.7 left the `?version=` story unimplemented. This
 * script is the whole of it, deliberately small:
 *
 *   registry/<name>.json                        <- working copy, `build:theme` writes it
 *   registry/versions/v<version>/<name>.json    <- frozen copy, this script writes it
 *   registry/versions/v<version>/index.json     <- the index at that version
 *   registry/versions/manifest.json             <- digests for both, this script appends
 *
 * The route serves *only* frozen copies and verifies each against the manifest
 * digest, so an edit to a published file is caught rather than shipped.
 *
 * Re-publishing the same (name, version) with different bytes is refused. That
 * is the immutability rule, enforced here rather than hoped for: to change a
 * published item you publish a new version, full stop.
 *
 * **Why an index per version.** `shadcn-svelte@1.8.1` asks for
 * `<base>/styles/<style>/index.json` before it asks for anything else, so a
 * registry it can consume needs an index *at a version*, not only the live
 * catalogue. The index is a snapshot of the catalogue at publish time, written
 * once and never refreshed -- because refreshing it from a newer catalogue would
 * describe an old version with new summaries (a `target` that changed, a
 * description that moved on), which is a quiet lie. A version published before
 * this existed simply has no index, and `ui-registry` gained it with v1.1.0.
 */
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const REGISTRY_DIR = path.join(ROOT, "registry");
const INDEX_FILE = path.join(ROOT, "registry.json");
const VERSIONS_DIR = path.join(REGISTRY_DIR, "versions");
const MANIFEST_FILE = path.join(VERSIONS_DIR, "manifest.json");

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function fail(message) {
  process.stderr.write(`publish-item: ${message}\n`);
  process.exit(1);
}

const digestOf = (text) => createHash("sha256").update(text, "utf8").digest("hex");

const [name, version] = process.argv.slice(2);

if (name?.startsWith("--")) {
  fail(`unknown flag "${name}"; there are none. Publishing is one act: <name> <version>.`);
}
if (!name || !version) {
  fail("usage: publish-item <name> <version>   e.g. publish-item theme 1.0.0");
}
if (!SEMVER_RE.test(version)) {
  fail(`invalid version "${version}" (expected x.y.z, e.g. 1.0.0)`);
}
if (!NAME_RE.test(name)) {
  fail(`invalid item name "${name}" (expected lowercase kebab, e.g. theme)`);
}

const manifest = await readFile(MANIFEST_FILE, "utf8").then(JSON.parse).catch(() => ({
  $comment:
    "Published registry versions. Every entry is immutable: `npm run publish:item` refuses " +
    "to overwrite an existing (name, version) with different bytes. The route verifies each " +
    "read against these digests.",
  items: [],
  indexes: [],
}));
manifest.indexes ??= [];

await publishItem(name, version);
await writeIndex(version);

// ---------------------------------------------------------------- item publish

async function publishItem(itemName, itemVersion) {
  const source = path.join(REGISTRY_DIR, `${itemName}.json`);
  const raw = await readFile(source, "utf8").catch(() => null);
  if (raw === null) fail(`no such working item: registry/${itemName}.json (run build:theme first?)`);

  // The published document must be the item it claims to be.
  let item;
  try {
    item = JSON.parse(raw);
  } catch (error) {
    fail(`registry/${itemName}.json is not valid JSON: ${error.message}`);
  }
  if (item.name !== itemName) {
    fail(`registry/${itemName}.json declares name "${item.name}", expected "${itemName}"`);
  }

  const digest = digestOf(raw);
  const bytes = Buffer.byteLength(raw, "utf8");

  const existing = manifest.items.find(
    (entry) => entry.name === itemName && entry.version === itemVersion,
  );

  if (existing) {
    if (existing.sha256 === digest) {
      process.stdout.write(
        `publish-item: ${itemName}@${itemVersion} already published, identical (no-op)\n`,
      );
      return;
    }
    fail(
      `${itemName}@${itemVersion} is already published with different content ` +
        `(published sha256 ${existing.sha256.slice(0, 12)}..., working copy ${digest.slice(0, 12)}...). ` +
        `Published versions are immutable: pick the next version (e.g. ${bumpPatch(itemVersion)}).`,
    );
  }

  const targetDir = path.join(VERSIONS_DIR, `v${itemVersion}`);
  const target = path.join(targetDir, `${itemName}.json`);

  // A file with no manifest entry is an untracked artifact from an interrupted
  // publish; refuse rather than silently adopt it, because "adopt" is how an
  // edited file becomes a published version.
  const stray = await stat(target).catch(() => null);
  if (stray) {
    fail(`${path.relative(ROOT, target)} exists but is not in the manifest - inspect and remove it`);
  }

  await mkdir(targetDir, { recursive: true });
  await writeFile(target, raw, "utf8");

  manifest.items = [
    ...manifest.items,
    { name: itemName, version: itemVersion, sha256: digest, bytes, publishedAt: new Date().toISOString() },
  ].sort((a, b) => (a.name === b.name ? compareVersions(a.version, b.version) : a.name < b.name ? -1 : 1));

  process.stdout.write(
    `publish-item: published ${itemName}@${itemVersion} -> ${path.relative(ROOT, target)} ` +
      `(${bytes} bytes, sha256 ${digest.slice(0, 12)}...)\n`,
  );
}

// ---------------------------------------------------------------- index publish

/**
 * Writes `registry/versions/v<version>/index.json` listing every item published
 * at that version, and records its digest. Summaries come from the live
 * catalogue (`registry.json`); the items themselves never change, so a stale
 * summary is cosmetic and `--reindex` fixes it without touching a published item.
 */
async function writeIndex(indexVersion) {
  const published = manifest.items.filter((entry) => entry.version === indexVersion);
  if (published.length === 0) {
    fail(`nothing is published at ${indexVersion}, so there is no index to write`);
  }

  let catalogue;
  try {
    catalogue = JSON.parse(await readFile(INDEX_FILE, "utf8"));
  } catch (error) {
    fail(`registry.json is not valid JSON: ${error.message}`);
  }

  const items = [];
  for (const entry of published) {
    const summary = (catalogue.items ?? []).find((item) => item.name === entry.name);
    if (!summary) {
      fail(
        `${entry.name} is published at ${indexVersion} but is missing from registry.json - ` +
          `the index would be a lie, so nothing was written`,
      );
    }
    items.push(summary);
  }

  const document = {
    $schema: catalogue.$schema,
    name: catalogue.name,
    homepage: catalogue.homepage,
    items,
  };
  const raw = `${JSON.stringify(document, null, 2)}\n`;
  const digest = digestOf(raw);
  const bytes = Buffer.byteLength(raw, "utf8");

  const targetDir = path.join(VERSIONS_DIR, `v${indexVersion}`);
  const target = path.join(targetDir, "index.json");

  const recorded = manifest.indexes.find((entry) => entry.version === indexVersion);
  if (recorded && recorded.sha256 !== digest) {
    fail(
      `the index for ${indexVersion} already exists with different content. An index is ` +
        `published once, like the items it lists: publish a new version instead of rewriting ` +
        `this one's catalogue.`,
    );
  }

  await mkdir(targetDir, { recursive: true });
  await writeFile(target, raw, "utf8");

  manifest.indexes = [
    ...manifest.indexes.filter((entry) => entry.version !== indexVersion),
    { version: indexVersion, sha256: digest, bytes, publishedAt: new Date().toISOString() },
  ].sort((a, b) => compareVersions(a.version, b.version));

  await writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(
    `publish-item: index for ${indexVersion} -> ${path.relative(ROOT, target)} ` +
      `(${items.length} item(s), ${bytes} bytes, sha256 ${digest.slice(0, 12)}...)\n`,
  );
}

function compareVersions(a, b) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

function bumpPatch(value) {
  const parts = value.split(".").map(Number);
  parts[2] += 1;
  return parts.join(".");
}
