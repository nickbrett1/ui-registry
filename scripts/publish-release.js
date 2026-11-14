#!/usr/bin/env node
/**
 * Publishes the whole catalogue as one version.
 *
 *   npm run publish:release 1.10.0
 *
 * `publish:item` publishes *one* item, and for a version that is the whole
 * point of the release that is the wrong unit. A version index is projected
 * from the frozen items at request time, so a version that carries only the
 * item that changed serves an index of one: `add theme` against it answers
 * "Registry item 'theme' does not exist", which names the wrong problem and
 * sends you looking in the theme.
 *
 * So: if a version is a release, publish every item into it. The unchanged
 * ones are byte-identical re-publishes that `publish-item` accepts as no-ops,
 * so this is cheap and it makes the index the same shape as every other
 * version's.
 *
 * A version that is deliberately a single item is still fine -- some items are
 * genuinely additive -- but then pin consumers to a version that came after
 * the last release, not to it.
 */
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

const version = process.argv[2];

if (!version) {
  process.stderr.write("usage: publish-release <version>   e.g. publish-release 1.10.0\n");
  process.exit(1);
}
if (!SEMVER_RE.test(version)) {
  process.stderr.write(`publish-release: invalid version "${version}" (expected x.y.z)\n`);
  process.exit(1);
}

const catalogue = JSON.parse(await readFile(path.join(ROOT, "registry.json"), "utf8"));
const names = catalogue.items.map((item) => item.name);

let failures = 0;
for (const name of names) {
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts", "publish-item.js"), name, version],
    { encoding: "utf8" },
  );
  process.stdout.write(result.stdout ?? "");
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    failures += 1;
  }
}

if (failures > 0) {
  process.stderr.write(
    `publish-release: ${failures} of ${names.length} items failed; the version index would be ` +
      `incomplete until they are published.\n`,
  );
  process.exit(1);
}

process.stdout.write(`publish-release: ${names.length} items at v${version}\n`);
