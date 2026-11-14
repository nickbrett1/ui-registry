import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

const ROOT = path.resolve(process.cwd());

/**
 * The registry documents are only useful if they validate. `schema/` holds the
 * schemas as fetched from shadcn-svelte.com on 2026-11-14 (see schema/README.md);
 * they are vendored so CI does not depend on the documentation site being up, and
 * so a schema change upstream is a visible diff in this repo rather than a
 * silent change in what "valid" means.
 *
 * If this test fails after a schema refresh, the document is what is wrong, not
 * the test: the current schema wins over anything this repo assumed.
 */

const ajv = new Ajv2020({ allErrors: true, strict: false });

async function load(relative) {
  return JSON.parse(await readFile(path.join(ROOT, relative), "utf8"));
}

describe("registry documents validate against the shadcn-svelte schemas", () => {
  it("registry.json (the index)", async () => {
    const schema = await load("schema/registry.json");
    const validate = ajv.compile(schema);
    const valid = validate(await load("registry.json"));

    expect(
      validate.errors ?? [],
      JSON.stringify(validate.errors, null, 2),
    ).toEqual([]);
    expect(valid).toBe(true);
  });

  it("registry/theme.json (a served item)", async () => {
    const schema = await load("schema/registry-item.json");
    const validate = ajv.compile(schema);
    const valid = validate(await load("registry/theme.json"));

    expect(
      validate.errors ?? [],
      JSON.stringify(validate.errors, null, 2),
    ).toEqual([]);
    expect(valid).toBe(true);
  });

  it("all built block items validate against schema/registry-item.json", async () => {
    const schema = await load("schema/registry-item.json");
    const validate = ajv.compile(schema);
    const index = await load("registry.json");
    const blockItems = index.items.filter(
      (item) => item.type === "registry:block",
    );

    expect(blockItems.length).toBe(10);

    for (const block of blockItems) {
      const item = await load(`registry/${block.name}.json`);
      const valid = validate(item);
      expect(
        validate.errors ?? [],
        `block ${block.name}: ${JSON.stringify(validate.errors, null, 2)}`,
      ).toEqual([]);
      expect(valid).toBe(true);
    }
  });

  it("the index item points at a file that exists", async () => {
    const index = await load("registry.json");
    for (const item of index.items) {
      for (const file of item.files ?? []) {
        await expect(
          readFile(path.join(ROOT, file.path), "utf8"),
        ).resolves.toBeTruthy();
      }
    }
  });
});
