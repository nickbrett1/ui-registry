import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
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

function run(args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

describe("publish-item", () => {
  it("is a no-op when the same version is published with identical content", () => {
    const result = run(["theme", "1.0.0"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("already published, identical");
  });

  it("refuses to overwrite a published version with different content", async () => {
    const original = await readFile(WORKING_ITEM, "utf8");
    try {
      // A semantically invisible edit is still a different document, and that is
      // the point: the rule is about bytes, not intent.
      await writeFile(WORKING_ITEM, `${original.trimEnd()}\n\n`, "utf8");

      const result = run(["theme", "1.0.0"]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("immutable");
      expect(result.stderr).toContain("1.0.1");
    } finally {
      await writeFile(WORKING_ITEM, original, "utf8");
    }
  });

  it("rejects a non-semver version and an unknown item", () => {
    expect(run(["theme", "1.0"]).code).toBe(1);
    expect(run(["nope", "1.0.0"]).code).toBe(1);
  });
});
