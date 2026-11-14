import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { compile } from "svelte/compiler";

const ROOT = path.resolve(process.cwd());
const BLOCKS_DIR = path.join(ROOT, "blocks");
// Install targets are relative to the **components alias**, which the CLI
// prepends: `$lib/components` + `nb/AppShell.svelte`. Proven by running it.
const COMPONENT_DIR = "nb";

/**
 * The ten blocks are the house *layouts*, and the rules that make them a design
 * system rather than nine components are all checkable:
 *
 *   1. **No block owns a colour.** Every colour is `var(--…)` from the theme; a
 *      raw hex in a block is the first step back to nine different looks.
 *   2. **The served item is the source.** The item's `content` is byte-identical
 *      to `blocks/<name>/<Name>.svelte`, so a published block cannot drift from
 *      the file that was reviewed.
 *   3. **Each block compiles.** A block that does not compile installs a broken
 *      file into a project, which is worse than shipping nothing.
 *   4. **Each has a real install target** under the components alias.
 */

async function blockDirs() {
  const entries = await readdir(BLOCKS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

async function loadBlock(name) {
  const dir = path.join(BLOCKS_DIR, name);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".svelte"));
  expect(files, `${name} should hold exactly one .svelte file`).toHaveLength(1);
  const source = path.join(dir, files[0]);
  return {
    name,
    file: files[0],
    path: source,
    content: await readFile(source, "utf8"),
    item: JSON.parse(
      await readFile(path.join(ROOT, "registry", `${name}.json`), "utf8"),
    ),
  };
}

const THEME_CLASSES = [
  ".card",
  ".micro",
  ".pill",
  ".section-title",
  ".btn",
  ".hint",
  ".notice",
  ".seg",
];

describe("the ten blocks", () => {
  it("are exactly the ten the design note names", async () => {
    expect(await blockDirs()).toEqual([
      "app-shell",
      "burst-timeline",
      "data-table",
      "detail-panel",
      "empty-state",
      "filter-panel",
      "request-form",
      "result-list",
      "stat-strip",
      "status-view",
    ]);
  });

  it("every block compiles", async () => {
    for (const name of await blockDirs()) {
      const { content } = await loadBlock(name);
      const compiled = compile(content, {
        filename: `${name}.svelte`,
        generate: "client",
      });
      expect(
        compiled.warnings ?? [],
        `${name}: ${JSON.stringify(compiled.warnings)}`,
      ).toEqual([]);
    }
  });

  it("no block hardcodes a colour in its own styles", async () => {
    for (const name of await blockDirs()) {
      const { content } = await loadBlock(name);
      const style =
        /<style[\s\S]*?>([\s\S]*?)<\/style>/.exec(content)?.[1] ?? "";
      const withoutComments = style.replace(/\/\*[\s\S]*?\*\//g, "");
      const hexes = withoutComments.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      const rgb = withoutComments.match(/\b(?:rgba?|hsla?)\(/g) ?? [];
      // No exceptions. The theme has a token for every colour a layout needs, and
      // a translucent tint is `color-mix(in srgb, var(--bg) 88%, transparent)` --
      // derived from the token, so a palette change moves the blocks with it.
      expect(
        hexes,
        `${name} hardcodes a hex colour: ${hexes.join(", ")}`,
      ).toEqual([]);
      expect(
        rgb,
        `${name} hardcodes an rgb()/hsl() colour: ${rgb.join(", ")}`,
      ).toEqual([]);
    }
  });

  it("every block leans on the theme's grammar", async () => {
    for (const name of await blockDirs()) {
      const { content } = await loadBlock(name);
      const usesToken = content.includes("var(--");
      const usesClass = THEME_CLASSES.some((cls) => {
        const bare = cls.replace(/^\./, "");
        return new RegExp(`class="[^"]*\\b${bare}\\b`).test(content);
      });
      expect(usesToken, `${name} uses no theme variable`).toBe(true);
      expect(usesClass, `${name} uses no theme class`).toBe(true);
    }
  });

  it("the served item is byte-identical to the source file", async () => {
    for (const name of await blockDirs()) {
      const { content, item } = await loadBlock(name);
      expect(item.type).toBe("registry:block");
      expect(item.files).toHaveLength(1);
      expect(item.files[0].content).toBe(content);
      expect(item.meta.sha256).toBe(
        createHash("sha256").update(content, "utf8").digest("hex"),
      );
    }
  });

  it("installs into the components alias, as a file with an explicit target", async () => {
    for (const name of await blockDirs()) {
      const { item } = await loadBlock(name);
      // `registry:file` with a target, not `registry:block`'s implicit resolution:
      // the theme taught us that a type whose path is resolved *for* you is a type
      // whose path you cannot assert.
      expect(item.files[0].type).toBe("registry:file");
      expect(item.files[0].target).toMatch(
        new RegExp(`^${COMPONENT_DIR}/[A-Za-z]+\\.svelte$`),
      );
      expect(item.files[0].target).not.toContain("..");
    }
  });

  it("are all listed in the root catalogue with a source path that exists", async () => {
    const index = JSON.parse(
      await readFile(path.join(ROOT, "registry.json"), "utf8"),
    );
    const blocks = index.items.filter((item) => item.type === "registry:block");
    expect(blocks.map((b) => b.name).sort()).toEqual(await blockDirs());

    for (const block of blocks) {
      await expect(
        readFile(path.join(ROOT, block.files[0].path), "utf8"),
      ).resolves.toBeTruthy();
      expect(block.files[0].target).toMatch(/^nb\//);
    }
  });
});
