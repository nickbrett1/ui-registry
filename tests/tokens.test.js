import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Not `new URL(..., import.meta.url)`: under the jsdom environment that resolves
// to the dev-server origin, not a file path.
const ROOT = process.cwd();
const SCRIPT = resolve(ROOT, "scripts/check-tokens.mjs");

function run(cwd, args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), "tokens-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

describe("scripts/check-tokens.mjs", () => {
  it("passes this repo: every block names a role, never a value", () => {
    const { status, out } = run(ROOT, ["blocks"]);
    expect(out).toContain("✓");
    expect(status).toBe(0);
  });

  it("fails a literal colour in a component, and names the line", () => {
    const dir = project({
      "src/Thing.svelte": "<style>\n  .x { color: #fff; }\n</style>\n",
    });
    const { status, out } = run(dir, ["src"]);
    expect(status).toBe(1);
    expect(out).toContain("Thing.svelte:2");
  });

  it("does not count the theme, a comment, or browser chrome", () => {
    const dir = project({
      "src/app.css": ":root {\n  --bg: #0f172a;\n  --ink: oklch(0.9 0 0);\n}\n",
      "src/Card.svelte": [
        "<!-- the ground is #0f172a, not #000 -->",
        "<style>/* borders are rgba tints */ .c { background: var(--bg-raised); }</style>",
      ].join("\n"),
      "src/app.html": '<meta name="theme-color" content="#0f172a" />',
    });
    const { status, out } = run(dir, ["src"]);
    expect(out).toContain("✓");
    expect(status).toBe(0);
  });

  it("lets a consumer point at where the CLI merged its tokens", () => {
    const dir = project({
      "web/src/app.css": ":root { --bg: #0f172a; }\n",
      "web/src/View.svelte": "<style>.v { color: var(--ink); }</style>\n",
      "web/src/Legacy.svelte": "<style>.l { color: #fff; }</style>\n",
    });
    expect(run(dir, ["web/src", "--theme", "web/src/app.css"]).status).toBe(1);
    // Without `--theme` the default is this repo's `src/app.css`, so the merged
    // stylesheet is just another file full of literals -- loudly wrong, never
    // silently passing.
    const defaulted = run(dir, ["web/src"]);
    expect(defaulted.status).toBe(1);
    expect(defaulted.out).toContain("web/src/app.css");
  });
});
