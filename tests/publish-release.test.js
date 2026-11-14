import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * `publish:item` is the right unit for "I changed one block". It is the wrong
 * unit for a *release*: the per-version index is projected from the frozen
 * items, so a version that carries only the item that changed serves an index
 * of one, and the CLI then answers "Registry item 'theme' does not exist" --
 * naming the wrong problem, in a version whose own item serves perfectly.
 *
 * These tests run against a throwaway tree, because the scripts resolve `ROOT`
 * from their own location: copying `scripts/` and `registry/` into a temp dir
 * is enough, and it means this file can add versions without racing the real
 * manifest (which `publish-item.test.js` does mutate).
 */

const ROOT = path.resolve(process.cwd());
const NAMES = ["theme", "app-shell", "bar-series"];

let work;

const item = (name) => ({
  $schema: "https://shadcn-svelte.com/schema/registry-item.json",
  name,
  type: "registry:ui",
  dependencies: [],
  files: [],
});

async function scaffold() {
  work = await mkdtemp(path.join(tmpdir(), "publish-release-"));
  await mkdir(path.join(work, "scripts"), { recursive: true });
  await mkdir(path.join(work, "registry"), { recursive: true });
  for (const script of ["publish-item.js", "publish-release.js"]) {
    await cp(path.join(ROOT, "scripts", script), path.join(work, "scripts", script));
  }
  for (const name of NAMES) {
    await writeFile(
      path.join(work, "registry", `${name}.json`),
      JSON.stringify(item(name), null, 2),
      "utf8",
    );
  }
  await writeFile(
    path.join(work, "registry.json"),
    JSON.stringify({ name: "fixture", items: NAMES.map((name) => ({ name })) }),
    "utf8",
  );
}

function run(script, args) {
  try {
    const stdout = execFileSync(process.execPath, [path.join(work, "scripts", script), ...args], {
      cwd: work,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return { status: error.status ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

// Absent until the first publish, which is why "refuses before publishing" can
// assert an empty list rather than an empty directory.
const frozen = () =>
  readdir(path.join(work, "registry", "versions"))
    .then((dirs) => dirs.sort())
    .catch(() => []);
const inVersion = (version) =>
  readdir(path.join(work, "registry", "versions", `v${version}`)).then((files) =>
    files.map((file) => file.replace(/\.json$/, "")).sort(),
  );

beforeEach(scaffold);
afterEach(() => rm(work, { recursive: true, force: true }));

describe("publish:release", () => {
  it("publishes every item in the catalogue, not just the one that changed", async () => {
    const result = run("publish-release.js", ["1.0.0"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("3 items at v1.0.0");
    expect(await inVersion("1.0.0")).toEqual([...NAMES].sort());
  });

  it("turns a one-item version into a complete one instead of leaving a short index", async () => {
    // The failure this script exists for: one item published deliberately, as
    // an additive change, and every other item now "does not exist" at that
    // version -- while the version's own file serves fine.
    expect(run("publish-item.js", ["bar-series", "1.1.0"]).status).toBe(0);
    expect(await inVersion("1.1.0")).toEqual(["bar-series"]);

    expect(run("publish-release.js", ["1.1.0"]).status).toBe(0);
    expect(await inVersion("1.1.0")).toEqual([...NAMES].sort());
  });

  it("is a no-op on a version that is already complete", async () => {
    run("publish-release.js", ["1.0.0"]);
    const again = run("publish-release.js", ["1.0.0"]);

    expect(again.status).toBe(0);
    expect(again.stdout.match(/already published, identical/g)).toHaveLength(NAMES.length);
    expect(await frozen()).toEqual(["manifest.json", "v1.0.0"]);
  });

  it("refuses a version that is not x.y.z, without publishing anything", async () => {
    const result = run("publish-release.js", ["1.10"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid version");
    expect(await frozen()).toEqual([]);
  });

  it("prints usage when asked for nothing", () => {
    const result = run("publish-release.js", []);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("publish-release <version>");
  });

  it("names the count when an item fails, because a short index is the failure", async () => {
    // Make one working item disagree with the catalogue it is published under.
    await writeFile(
      path.join(work, "registry.json"),
      JSON.stringify({ name: "fixture", items: [...NAMES, "missing"].map((name) => ({ name })) }),
      "utf8",
    );

    const result = run("publish-release.js", ["2.0.0"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("1 of 4 items failed");
    expect(await inVersion("2.0.0")).toEqual([...NAMES].sort());
  });

  it("records a digest for every item it publishes", async () => {
    run("publish-release.js", ["1.0.0"]);

    const manifest = JSON.parse(
      await readFile(path.join(work, "registry", "versions", "manifest.json"), "utf8"),
    );
    expect(manifest.items.map((entry) => entry.name).sort()).toEqual([...NAMES].sort());
    for (const entry of manifest.items) expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
