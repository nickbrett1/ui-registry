# Vendored registry schemas

Fetched verbatim from the shadcn-svelte documentation site on **2026-11-14**:

| File | Source URL |
|---|---|
| `registry.json` | <https://shadcn-svelte.com/schema/registry.json> |
| `registry-item.json` | <https://shadcn-svelte.com/schema/registry-item.json> |

They are vendored, not fetched at test time, for two reasons: CI must not depend
on the docs site being reachable, and a change upstream should arrive as a visible
diff in this repo rather than silently changing what "valid" means.

`tests/registry-schema.test.js` validates `registry.json` and `registry/theme.json`
against these with ajv (draft 2020-12).

## What the schemas actually say (found by reading them, not from memory)

The design note's §3.5.1 describes an item's `files[]` as `{path, content, type}`.
That is the **authoring** shape. The two shapes are not the same, and mixing them
is the easiest way to write JSON that a build step rejects:

- **`registry.json` (the index)** items list their files as
  `{path, type, target?}` — `path` is the file inside *this* repo. Required keys
  on an index item are `name`, `type`, `registryDependencies`, `files`, and
  `additionalProperties` is `false`, so `categories` and friends are rejected
  here even though a served item accepts them.
- **`registry-item.json` (a served item)** files are
  `{content, type, target}` — `content` is the inlined text, `target` is where it
  is installed. All three are required for a file entry.

Both enums include `registry:theme`, which is the correct type for the theme
item ("Use for themes"); `registry:style` is for shadcn style presets like
`new-york`. The design note's "`registry:style` (or the shadcn-svelte
equivalent)" resolves to `registry:theme`.
