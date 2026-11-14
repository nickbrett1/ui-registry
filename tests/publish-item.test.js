import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * The immutability rule has two halves and the route only enforces one of them.
 * The route refuses to *serve* a version that no longer matches its digest; this
 * file checks the other half -- that publishing cannot create such a mismatch,
 * because `publish:item` refuses to overwrite a published (name, version).
 *
 * The script operates on the real tree (it resolves ROOT from its own location),
 * so the one test that mutates `registry/theme.json` restores it in `finally`.
 */

const ROOT = path.resolve(process.cwd());
const SCRIPT = path.join(ROOT, "scripts", "publish-item.js");
const WORKING_ITEM = path.join(ROOT, "registry", "theme.json");
const MANIFEST = path.join(ROOT, "registry", "versions", "manifest.json");

/**
 * The newest published version of `theme`. Derived rather than hard-coded: these
 * assertions are about the rule, not about which version happens to be current,
 * and a literal here would silently become a test of an old frozen file.
 */
async function latestThemeVersion() {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const versions = manifest.items
    .filter((entry) => entry.name === "theme")
    .map((entry) => entry.version)
    .sort((a, b) => {
      const [x, y, z] = a.split(".").map(Number);
      const [p, q, r] = b.split(".").map(Number);
      return x - p || y - q || z - r;
    });
  return versions.at(-1);
}

/**
 * Run `fn` with the working copy byte-identical to `version`'s published file.
 *
 * The no-op path is "publishing the same bytes again changes nothing", and it
 * can only be exercised when the two agree. A checkout mid-change has an
 * unpublished edit in `registry/theme.json` -- the normal state while a block
 * or the theme is being worked on -- so pinning these tests to "the working
 * copy happens to equal the newest release" would make them a test of the
 * release calendar rather than of the rule.
 */
async function withPublishedBytes(version, fn) {
  const original = await readFile(WORKING_ITEM, "utf8");
  const published = await readFile(
    path.join(ROOT, "registry", "versions", `v${version}`, "theme.json"),
    "utf8",
  );
  try {
    await writeFile(WORKING_ITEM, published, "utf8");
    return await fn();
  } finally {
    await writeFile(WORKING_ITEM, original, "utf8");
  }
}

function nextPatch(version) {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

function run(args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      code: error.status ?? 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

describe("publish-item", () => {
  it("is a no-op when the same version is published with identical content", async () => {
    const version = await latestThemeVersion();
    const result = await withPublishedBytes(version, () =>
      run(["theme", version]),
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("already published, identical");
  });

  it("refuses to overwrite a published version with different content", async () => {
    const original = await readFile(WORKING_ITEM, "utf8");
    try {
      // A semantically invisible edit is still a different document, and that is
      // the point: the rule is about bytes, not intent.
      await writeFile(WORKING_ITEM, `${original.trimEnd()}\n\n`, "utf8");

      const version = await latestThemeVersion();
      const result = run(["theme", version]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("immutable");
      expect(result.stderr).toContain(nextPatch(version));
    } finally {
      await writeFile(WORKING_ITEM, original, "utf8");
    }
  });

  it("rejects a non-semver version and an unknown item", () => {
    expect(run(["theme", "1.0"]).code).toBe(1);
    expect(run(["nope", "1.0.0"]).code).toBe(1);
  });
});

describe("publish-item --dry-run and --list", () => {
  it("says what it would do and writes nothing", async () => {
    const next = nextPatch(await latestThemeVersion());
    const result = run(["theme", next, "--dry-run"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("would publish");
    expect(result.stdout).toContain("nothing written");

    // The claim is that nothing was written, so it is checked rather than trusted.
    const created = await access(
      path.join(ROOT, "registry", "versions", `v${next}`, "theme.json"),
    ).then(
      () => true,
      () => false,
    );
    expect(created).toBe(false);
    expect(
      JSON.parse(await readFile(MANIFEST, "utf8")).items.some(
        (entry) => entry.version === next,
      ),
    ).toBe(false);
  });

  it("is a no-op dry run for a version already published with identical content", async () => {
    const version = await latestThemeVersion();
    const result = await withPublishedBytes(version, () =>
      run(["theme", version, "--dry-run"]),
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("already published, identical");
  });

  it("lists what is published, and whether the working copy still matches", async () => {
    const result = run(["--list"]);
    expect(result.code).toBe(0);
    // Every item in the manifest appears, with the state of its working copy --
    // the column that answers "is there an unpublished change?".
    const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
    for (const name of new Set(manifest.items.map((entry) => entry.name))) {
      expect(result.stdout).toContain(name);
    }
    expect(result.stdout).toMatch(/working copy (current|differs)/);
  });

  it("refuses an unknown flag and names the ones it has", () => {
    const result = run(["--bogus"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--dry-run");
  });
});
