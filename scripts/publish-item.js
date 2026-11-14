#!/usr/bin/env node
/**
 * Publishes `registry/<name>.json` as an immutable version.
 *
 *   npm run publish:item theme 1.0.0
 *
 * Design note §3.5: "a design system that mutates under a live project is worse
 * than a stale one", and §3.6.7 left the `?version=` story unimplemented. This
 * script is the whole of it, deliberately small:
 *
 *   registry/<name>.json                  <- the working copy, `build:theme` writes it
 *   registry/versions/v<version>/<name>.json   <- the frozen copy, this script writes it
 *   registry/versions/manifest.json       <- name + version -> sha256, this script appends
 *
 * The route serves *only* the frozen copies, and checks each read against the
 * manifest digest, so an edit to a published file is caught rather than shipped.
 *
 * Re-publishing the same (name, version) with different bytes is refused. That
 * is the immutability rule, and it is enforced here rather than hoped for: to
 * change a published item you publish a new version, full stop.
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

const [name, version] = process.argv.slice(2);

if (!name || !version) fail("usage: publish-item <name> <version>   e.g. publish-item theme 1.0.0");
if (!NAME_RE.test(name)) fail(`invalid item name "${name}" (expected lowercase kebab, e.g. theme)`);
if (!SEMVER_RE.test(version)) fail(`invalid version "${version}" (expected x.y.z, e.g. 1.0.0`);

const source = path.join(REGISTRY_DIR, `${name}.json`);
const raw = await readFile(source, "utf8").catch(() => null);
if (raw === null) fail(`no such working item: registry/${name}.json (run build:theme first?)`);

// The published document must be the item it claims to be.
let item;
try {
  item = JSON.parse(raw);
} catch (error) {
  fail(`registry/${name}.json is not valid JSON: ${error.message}`);
}
if (item.name !== name) fail(`registry/${name}.json declares name "${item.name}", expected "${name}"`);

const digest = createHash("sha256").update(raw, "utf8").digest("hex");
const bytes = Buffer.byteLength(raw, "utf8");

const manifest = await readFile(MANIFEST_FILE, "utf8").then(JSON.parse).catch(() => ({
  $comment:
    "Published registry versions. Every entry is immutable: `npm run publish:item` refuses " +
    "to overwrite an existing (name, version) with different bytes. The route verifies each " +
    "read against these digests.",
  items: [],
}));

const existing = (manifest.items ?? []).find(
  (entry) => entry.name === name && entry.version === version,
);

if (existing) {
  if (existing.sha256 === digest) {
    process.stdout.write(`publish-item: ${name}@${version} already published, identical (no-op)\n`);
    process.exit(0);
  }
  fail(
    `${name}@${version} is already published with different content ` +
      `(published sha256 ${existing.sha256.slice(0, 12)}..., working copy ${digest.slice(0, 12)}...). ` +
      `Published versions are immutable: pick the next version (e.g. ${bumpPatch(version)}).`,
  );
}

const targetDir = path.join(VERSIONS_DIR, `v${version}`);
const target = path.join(targetDir, `${name}.json`);

// A file with no manifest entry is an untracked artifact from an interrupted
// publish; refuse rather than silently adopt it, because "adopt" is how an
// edited file becomes a published version.
const stray = await stat(target).catch(() => null);
if (stray) fail(`${path.relative(ROOT, target)} exists but is not in the manifest - inspect and remove it`);

await mkdir(targetDir, { recursive: true });
await writeFile(target, raw, "utf8");

manifest.items = [...(manifest.items ?? []), { name, version, sha256: digest, bytes, publishedAt: new Date().toISOString() }].sort(
  (a, b) => (a.name === b.name ? compareVersions(a.version, b.version) : a.name < b.name ? -1 : 1),
);
await writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

process.stdout.write(
  `publish-item: published ${name}@${version} -> ${path.relative(ROOT, target)} ` +
    `(${bytes} bytes, sha256 ${digest.slice(0, 12)}...)\n`,
);

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
