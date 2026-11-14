#!/usr/bin/env node
/**
 * Publishes `registry/<name>.json` as an immutable version.
 *
 *   npm run publish:item theme 1.0.0
 *   npm run publish:item theme 1.0.0 -- --dry-run   what would happen, writes nothing
 *   npm run publish:item -- --list                  what has been published, and whether
 *                                                   the working copy still matches it
 *
 * Design note §3.5: "a design system that mutates under a live project is worse
 * than a stale one", and §3.6.7 left the `?version=` story unimplemented. This
 * script is the whole of it, deliberately small:
 *
 *   registry/<name>.json                        <- working copy, `build:theme` writes it
 *   registry/versions/v<version>/<name>.json    <- frozen copy, this script writes it
 *   registry/versions/manifest.json             <- its digest, this script appends
 *
 * The route serves *only* frozen copies and verifies each against the manifest
 * digest, so an edit to a published file is caught rather than shipped.
 *
 * Re-publishing the same (name, version) with different bytes is refused. That
 * is the immutability rule, enforced here rather than hoped for: to change a
 * published item you publish a new version, full stop.
 *
 * **There is no stored index, deliberately.** The CLI asks for
 * `<base>/index.json` before anything else, and an earlier version of this
 * script wrote one per version as a snapshot of the catalogue. That was wrong
 * twice: it could be written from a newer catalogue, which describes an old
 * version with a `target` it never shipped, and it was the wrong *shape* anyway
 * (the CLI wants a JSON array with `relativeUrl`, not a `{name, items}` object).
 * The route now projects the index from the frozen items at request time, so it
 * cannot drift and there is nothing to publish or repair.
 */
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const REGISTRY_DIR = path.join(ROOT, "registry");
const VERSIONS_DIR = path.join(REGISTRY_DIR, "versions");
const MANIFEST_FILE = path.join(VERSIONS_DIR, "manifest.json");

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function fail(message) {
  process.stderr.write(`publish-item: ${message}\n`);
  process.exit(1);
}

const digestOf = (text) =>
  createHash("sha256").update(text, "utf8").digest("hex");

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
const [name, version] = argv.filter((arg) => !arg.startsWith("--"));

const KNOWN_FLAGS = new Set(["--dry-run", "--list", "--help"]);
for (const flag of flags) {
  if (!KNOWN_FLAGS.has(flag)) {
    fail(`unknown flag "${flag}"; known flags: ${[...KNOWN_FLAGS].join(", ")}`);
  }
}

if (flags.has("--help")) {
  process.stdout.write(
    "usage: publish-item <name> <version> [--dry-run]\n" +
      "       publish-item --list\n",
  );
  process.exit(0);
}

if (name && name.startsWith("--")) {
  fail(
    `unknown flag "${name}"; there are none. Publishing is one act: <name> <version>.`,
  );
}
if (!flags.has("--list")) {
  if (!name || !version) {
    fail(
      "usage: publish-item <name> <version>   e.g. publish-item theme 1.0.0",
    );
  }
  if (!SEMVER_RE.test(version)) {
    fail(`invalid version "${version}" (expected x.y.z, e.g. 1.0.0)`);
  }
  if (!NAME_RE.test(name)) {
    fail(`invalid item name "${name}" (expected lowercase kebab, e.g. theme)`);
  }
}

const manifest = await readFile(MANIFEST_FILE, "utf8")
  .then(JSON.parse)
  .catch(() => ({
    $comment:
      "Published registry versions. Every entry is immutable: `npm run publish:item` refuses " +
      "to overwrite an existing (name, version) with different bytes. The route verifies each " +
      "read against these digests.",
    items: [],
  }));

if (flags.has("--list")) {
  await list();
  process.exit(0);
}

await publishItem(name, version, { dryRun: flags.has("--dry-run") });

// ---------------------------------------------------------------- item publish

/**
 * What has been published, and whether the working copy still matches it.
 *
 * The second column is the one worth having: a working copy that differs from
 * the newest published item is either a change waiting for a version, or a change
 * that was published as a *release* (`publish:release` publishes every item) and
 * never hand-published. Cheap to ask; invisible otherwise.
 */
async function list() {
  const byName = new Map();
  for (const entry of manifest.items) {
    if (!byName.has(entry.name)) byName.set(entry.name, []);
    byName.get(entry.name).push(entry);
  }

  if (byName.size === 0) {
    process.stdout.write("publish-item: nothing published yet\n");
    return;
  }

  const rows = [];
  for (const itemName of [...byName.keys()].sort()) {
    const versions = byName
      .get(itemName)
      .sort((a, b) => compareVersions(a.version, b.version));
    const newest = versions.at(-1);
    const raw = await readFile(
      path.join(REGISTRY_DIR, `${itemName}.json`),
      "utf8",
    ).catch(() => null);
    const state =
      raw === null
        ? "no working copy"
        : digestOf(raw) === newest.sha256
          ? "working copy current"
          : "working copy differs (needs a new version)";
    rows.push(
      `${itemName.padEnd(16)} ${newest.version.padEnd(8)} ${versions.length} version(s)  ${state}`,
    );
  }
  process.stdout.write(`${rows.join("\n")}\n`);
}

async function publishItem(itemName, itemVersion, { dryRun = false } = {}) {
  const source = path.join(REGISTRY_DIR, `${itemName}.json`);
  const raw = await readFile(source, "utf8").catch(() => null);
  if (raw === null)
    fail(
      `no such working item: registry/${itemName}.json (run build:theme first?)`,
    );

  // The published document must be the item it claims to be.
  let item;
  try {
    item = JSON.parse(raw);
  } catch (error) {
    fail(`registry/${itemName}.json is not valid JSON: ${error.message}`);
  }
  if (item.name !== itemName) {
    fail(
      `registry/${itemName}.json declares name "${item.name}", expected "${itemName}"`,
    );
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
    fail(
      `${path.relative(ROOT, target)} exists but is not in the manifest - inspect and remove it`,
    );
  }

  if (dryRun) {
    process.stdout.write(
      `publish-item: would publish ${itemName}@${itemVersion} -> ${path.relative(ROOT, target)} ` +
        `(${bytes} bytes, sha256 ${digest.slice(0, 12)}...) [dry run: nothing written]\n`,
    );
    return;
  }

  await mkdir(targetDir, { recursive: true });
  await writeFile(target, raw, "utf8");

  manifest.items = [
    ...manifest.items,
    {
      name: itemName,
      version: itemVersion,
      sha256: digest,
      bytes,
      publishedAt: new Date().toISOString(),
    },
  ].sort((a, b) =>
    a.name === b.name
      ? compareVersions(a.version, b.version)
      : a.name < b.name
        ? -1
        : 1,
  );

  await writeManifest();

  process.stdout.write(
    `publish-item: published ${itemName}@${itemVersion} -> ${path.relative(ROOT, target)} ` +
      `(${bytes} bytes, sha256 ${digest.slice(0, 12)}...)\n`,
  );
}

function writeManifest() {
  return writeFile(
    MANIFEST_FILE,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
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
