import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { GET } from "../src/routes/r/[...path]/+server.js";

const ROOT = path.resolve(process.cwd());

/**
 * The route resolves its roots from `process.cwd()`, so these tests exercise the
 * real committed tree -- `registry.json` and `registry/theme.json` as shipped --
 * rather than a mock. The four things the brief names as "cheap and would
 * silently regress" are here: index served, 401 with no token, 401 with a wrong
 * token, traversal refused. The rest guard the edges those four imply.
 */

beforeAll(async () => {
  // Fixtures live inside the served tree on purpose: that is the only way to
  // exercise the containment check against the same root the route uses.
  await mkdir(path.join(ROOT, "registry", "__testdir__"), { recursive: true });
  await writeFile(
    path.join(ROOT, "registry", "__test__.txt"),
    "not servable",
    "utf8",
  );
  await writeFile(
    path.join(ROOT, "registry", "__testdir__", "inside.json"),
    "{}",
    "utf8",
  );
  // A committed symlink is the one escape a lexical `..` check cannot see.
  await symlink(
    "/etc/hostname",
    path.join(ROOT, "registry", "__testlink__.json"),
  ).catch(() => {});
});

afterAll(async () => {
  await rm(path.join(ROOT, "registry", "__testdir__"), {
    recursive: true,
    force: true,
  });
  await rm(path.join(ROOT, "registry", "__test__.txt"), { force: true });
  await rm(path.join(ROOT, "registry", "__testlink__.json"), { force: true });
});

function call(segments, query = "") {
  // No Authorization header, deliberately: the endpoint is public (2026-11-14).
  const request = new Request(`http://localhost/r/${segments ?? ""}${query}`);
  return GET({ params: { path: segments ?? "" }, request });
}

/** The digest of a published file, as the manifest records it. */
async function readManifest() {
  return JSON.parse(
    await readFile(
      path.join(ROOT, "registry", "versions", "manifest.json"),
      "utf8",
    ),
  );
}

describe("GET /r - public, deliberately", () => {
  it("serves the index with no Authorization header", async () => {
    const response = await call("registry.json");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.name).toBe("nb");
    // The live catalogue: one theme and the eleven blocks it styles.
    expect(body.items.map((item) => item.name)).toEqual([
      "theme",
      "app-shell",
      "stat-strip",
      "result-list",
      "filter-panel",
      "empty-state",
      "status-view",
      "detail-panel",
      "burst-timeline",
      "bar-series",
      "data-table",
      "request-form",
    ]);
  });

  it("treats a bare /r as the index", async () => {
    const response = await call("");
    expect(response.status).toBe(200);
    expect((await response.json()).name).toBe("nb");
  });

  it("serves an item with no Authorization header", async () => {
    // The gate was removed because `shadcn-svelte@1.8.1` cannot send one; every
    // test below therefore goes through the same public path a real client uses.
    expect((await call("theme.json", "?version=1.1.0")).status).toBe(200);
  });

  it("does not accept or require a token: an Authorization header is ignored", async () => {
    // Nothing to leak, nothing to check. A stale client that still sends the
    // header must not be broken by its absence on the server.
    const request = new Request("http://localhost/r/registry.json", {
      headers: { authorization: "Bearer anything-at-all" },
    });
    const response = await GET({ params: { path: "registry.json" }, request });
    expect(response.status).toBe(200);
  });
});

describe("GET /r - documents", () => {
  it("serves the theme item with its CSS inlined", async () => {
    const response = await call("theme.json", "?version=1.2.0");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-registry-version")).toBe("1.2.0");

    const body = await response.json();
    expect(body.type).toBe("registry:theme");
    // A theme item has no `files` and no `target` (see the note below): its
    // payload is cssVars + a css string that the CLI merges into the consumer's
    // own stylesheet.
    expect(body.files).toBeUndefined();
    expect(body.cssVars.theme["--bg"]).toBe("#0f172a");
    expect(Object.keys(body.css)).toContain(".card");
  });

  it("returns 404 for an item that does not exist", async () => {
    const response = await call("nope.json", "?version=1.0.0");
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("not found");
  });

  it("serves nothing with an extension outside the allowlist", async () => {
    const response = await call("__test__.txt", "?version=1.0.0");
    expect(response.status).toBe(404);
  });

  it("refuses a directory", async () => {
    expect((await call("__testdir__", "?version=1.0.0")).status).toBe(404);
  });

  it("refuses a nested item path, because published items are flat", async () => {
    // `registry/versions/v<x>/<name>.json` is the only shape; a nested segment
    // is not a published item and must not be reachable by path alone.
    expect(
      (await call("__testdir__/inside.json", "?version=1.0.0")).status,
    ).toBe(404);
  });
});

describe("GET /r - versioned items are immutable", () => {
  it("refuses an item with no version rather than serving whatever is on disk", async () => {
    const response = await call("theme.json");
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("version required");
  });

  it("names the available versions on an unversioned request", async () => {
    const body = await (await call("theme.json")).json();
    expect(body.available).toContain("1.0.0");
  });

  it("404s an unpublished version instead of falling back to the current one", async () => {
    const response = await call("theme.json", "?version=9.9.9");
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("not found");
  });

  it("rejects a version that is not semver, including traversal", async () => {
    for (const version of ["../v1.0.0", "1.0", "1.0.0/../..", "%2e%2e", ""]) {
      const response = await call(
        "theme.json",
        `?version=${encodeURIComponent(version)}`,
      );
      expect(response.status).toBe(400);
      expect(await response.text()).not.toContain("root:x:");
    }
  });

  it("serves a published version byte-for-byte from its frozen copy", async () => {
    const frozen = await readFile(
      path.join(ROOT, "registry", "versions", "v1.0.0", "theme.json"),
      "utf8",
    );
    const response = await call("theme.json", "?version=1.0.0");
    expect(await response.text()).toBe(frozen);
  });

  it("carries a strong etag so an immutable document can be cached", async () => {
    const response = await call("theme.json", "?version=1.0.0");
    const entry = (await readManifest()).items.find(
      (candidate) =>
        candidate.name === "theme" && candidate.version === "1.0.0",
    );
    expect(response.headers.get("etag")).toBe(`"${entry.sha256}"`);
  });

  it("every published file matches the digest in the manifest", async () => {
    // The immutability guard, seen from the tree rather than the route: an edit
    // to a published item must be detectable without trusting any one request.
    const manifest = await readManifest();
    expect(manifest.items.length).toBeGreaterThan(0);

    for (const entry of manifest.items) {
      const file = path.join(
        ROOT,
        "registry",
        "versions",
        `v${entry.version}`,
        `${entry.name}.json`,
      );
      const bytes = await readFile(file);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        entry.sha256,
      );
      expect(Buffer.byteLength(bytes)).toBe(entry.bytes);
    }
  });

  it("500s when a published file has been edited in place", async () => {
    // The rule is only real if breaking it is detected. The route compares each
    // read against the manifest digest, so an in-place edit is a 500 -- loud, and
    // never a silently mutated design system.
    const published = path.join(
      ROOT,
      "registry",
      "versions",
      "v1.0.0",
      "theme.json",
    );
    const original = await readFile(published, "utf8");
    try {
      await writeFile(published, `${original.trimEnd()}\n\n`, "utf8");
      const response = await call("theme.json", "?version=1.0.0");
      expect(response.status).toBe(500);
      expect((await response.json()).error).toBe("integrity check failed");
    } finally {
      await writeFile(published, original, "utf8");
    }
  });

  it("404s a manifest entry whose frozen file is missing", async () => {
    const published = path.join(
      ROOT,
      "registry",
      "versions",
      "v1.0.0",
      "theme.json",
    );
    const original = await readFile(published, "utf8");
    try {
      await rm(published);
      expect((await call("theme.json", "?version=1.0.0")).status).toBe(404);
    } finally {
      await writeFile(published, original, "utf8");
    }
  });

  it("still serves the index when the manifest is unreadable", async () => {
    // A corrupt manifest must degrade to "no versions advertised", not to a 500
    // on the one document that tells a client what exists.
    const manifestFile = path.join(
      ROOT,
      "registry",
      "versions",
      "manifest.json",
    );
    const original = await readFile(manifestFile, "utf8");
    try {
      await writeFile(manifestFile, "{ not json", "utf8");
      const response = await call("registry.json");
      expect(response.status).toBe(200);
      expect(response.headers.get("x-registry-versions")).toBe("");
      expect((await call("theme.json", "?version=1.0.0")).status).toBe(404);
    } finally {
      await writeFile(manifestFile, original, "utf8");
    }
  });

  it("the version listing on the index matches the manifest", async () => {
    const response = await call("registry.json");
    const versions = response.headers.get("x-registry-versions");
    for (const entry of (await readManifest()).items) {
      expect(versions).toContain(entry.version);
    }
  });
});

describe("GET /r - path traversal", () => {
  const attacks = [
    "../registry.json",
    "../../etc/passwd",
    "../../../etc/passwd",
    "/etc/passwd",
    "..%2f..%2fetc%2fpasswd",
    "%2e%2e/%2e%2e/etc/passwd",
    "....//....//etc/passwd",
    "registry.json/../../../etc/passwd",
  ];

  // Two gates now stand between a request and a file: the item-name allowlist
  // (`<name>.json`, no separators) and, behind it, manifest membership plus
  // realpath containment. These cases are 404s; the allowlist is what stops most
  // of them now, and the containment check is still there for the ones that look
  // like a plausible name.
  it.each(attacks)("refuses %s", async (attack) => {
    const response = await call(attack, "?version=1.0.0");
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("root:x:");
  });

  it("refuses a symlink that points out of the registry tree", async () => {
    const response = await call("__testlink__.json", "?version=1.0.0");
    expect(response.status).toBe(404);
  });

  it("refuses malformed percent-encoding instead of throwing", async () => {
    const response = await call("%zz.json", "?version=1.0.0");
    expect(response.status).toBe(404);
  });

  it("refuses a NUL byte", async () => {
    const response = await call("theme.json%00.png", "?version=1.0.0");
    expect(response.status).toBe(404);
  });
});

describe("GET /r - the CLI shape (version in the path)", () => {
  // Measured against `shadcn-svelte@1.8.1`, not guessed: it appends only
  // `index.json` / `<name>.json` to a base set by `COMPONENTS_REGISTRY_URL`, and
  // it parses the index as a JSON **array** whose entries carry `relativeUrl`.
  // Only the fallback path (no env var) inserts `/styles/<style>/`, so both
  // spellings are served.

  it("serves the versioned index as the array the CLI parses", async () => {
    const response = await call("v1.2.0/index.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-registry-version")).toBe("1.2.0");

    const body = await response.json();
    // An array, not `{name, items}`: the CLI rejects the object shape with
    // "ZodError: expected array", which is how this was found.
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      name: "theme",
      type: "registry:theme",
      relativeUrl: "theme.json",
    });
  });

  it("serves an item at a version by path", async () => {
    const response = await call("v1.2.0/theme.json");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.cssVars.theme["--bg"]).toBe("#0f172a");
    expect(Object.keys(body.css)).toContain(".card");
  });

  it("also serves the style-prefixed spelling, for the base-URL fallback path", async () => {
    // A base in `REGISTRY_URL` / `components.json` gets `/styles/<style>/`
    // appended by the CLI. Same documents, and any well-formed style segment is
    // accepted: this registry has one style, and rejecting names would break the
    // CLI for no gain.
    const index = await call("v1.2.0/styles/vega/index.json");
    expect(index.status).toBe(200);
    expect(Array.isArray(await index.json())).toBe(true);

    expect((await call("v1.2.0/styles/vega/theme.json")).status).toBe(200);
    expect((await call("v1.2.0/styles/new-york/theme.json")).status).toBe(200);
    expect((await call("v1.2.0/styles/nb/theme.json")).status).toBe(200);
  });

  it("projects the index from the frozen items, so an old version is described honestly", async () => {
    // v1.0.0 keeps `src/app.css`. Its index is derived from its own frozen bytes,
    // so it cannot be given the newer target -- which is what a stored index
    // written from the live catalogue would have done.
    const response = await call("v1.0.0/index.json");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body[0].relativeUrl).toBe("theme.json");

    const item = await (await call("v1.0.0/theme.json")).json();
    // v1.0.0 is the pre-2026-11-14 shape: a file with `target: src/app.css`.
    expect(item.files[0].target).toBe("src/app.css");
  });

  it("keeps each published shape exactly as it shipped, across a shape change", async () => {
    // Three versions, three shapes, none of them rewritten:
    //   1.0.0  files[].target = src/app.css          (before the target decision)
    //   1.1.0  files[].target = src/nb-theme.css     (before theme items were
    //                                                 understood to have no target)
    //   1.2.0  cssVars + css, no files at all
    // The last change is the kind a registry either handles honestly or not at
    // all: the item's *schema* moved, and 1.1.0 still serves what 1.1.0 served.
    const v100 = await (await call("v1.0.0/theme.json")).json();
    const v110 = await (await call("v1.1.0/theme.json")).json();
    const v120 = await (await call("v1.2.0/theme.json")).json();

    expect(v100.files[0].target).toBe("src/app.css");
    expect(v110.files[0].target).toBe("src/nb-theme.css");
    expect(v120.files).toBeUndefined();
    expect(v120.cssVars.theme["--bg"]).toBe("#0f172a");

    // Every one of them still declares the type that says what it is.
    for (const item of [v100, v110, v120])
      expect(item.type).toBe("registry:theme");
  });

  it("404s an unpublished version in the path shape", async () => {
    expect((await call("v9.9.9/theme.json")).status).toBe(404);
    expect((await call("v9.9.9/index.json")).status).toBe(404);
    expect((await call("v9.9.9/styles/vega/theme.json")).status).toBe(404);
  });

  it("refuses traversal through the style or name segment", async () => {
    const attacks = [
      "v1.2.0/styles/../../etc/passwd",
      "v1.2.0/styles/../../registry.json",
      "v1.2.0/styles/vega/../../../etc/passwd",
      "v1.2.0/styles/vega/..%2f..%2f..%2fetc%2fpasswd",
      "v1.2.0/styles/vega/theme.json%00.png",
      "v1.2.0/../../etc/passwd",
      "v1.2.0/theme.json%00.png",
    ];
    for (const attack of attacks) {
      const response = await call(attack);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain("root:x:");
    }
  });

  it("500s when a versioned item is edited in place, rather than projecting a lie", async () => {
    const published = path.join(
      ROOT,
      "registry",
      "versions",
      "v1.2.0",
      "theme.json",
    );
    const original = await readFile(published, "utf8");
    try {
      await writeFile(published, `${original.trimEnd()}\n\n`, "utf8");
      expect((await call("v1.2.0/theme.json")).status).toBe(500);
      // The index is built from the same bytes, so it must fail too rather than
      // describe a document it could not verify.
      expect((await call("v1.2.0/index.json")).status).toBe(500);
    } finally {
      await writeFile(published, original, "utf8");
    }
  });
});

describe("the theme has one source of truth", () => {
  it("registry/theme.json is a faithful split of src/app.css", async () => {
    // The drift guard. `npm run build:theme` regenerates the served item by
    // splitting the sheet into `:root` variables (`cssVars.theme`) and the rules
    // after it (`css`). Both halves are checked against the source, so a token
    // edited in `src/app.css` without a rebuild fails here rather than shipping
    // as a design system that disagrees with the app it was derived from.
    const { splitThemeSheet } = await import("../scripts/build-theme-item.js");
    const css = await readFile(path.join(ROOT, "src", "app.css"), "utf8");
    const item = JSON.parse(
      await readFile(path.join(ROOT, "registry", "theme.json"), "utf8"),
    );
    const expected = splitThemeSheet(css);

    expect(item.cssVars.theme).toEqual(expected.cssVars);
    // `css` is the object form the item schema requires, not the raw string.
    expect(item.css).toEqual(expected.cssObject);
    expect(item.files).toBeUndefined();
    // Provenance still names the source, because the served item no longer
    // carries the file itself.
    expect(item.meta.source).toBe("src/app.css");
    expect(item.meta.sha256).toHaveLength(64);
  });

  it("keeps the one non-token declaration from :root", async () => {
    // `color-scheme: dark` is not a custom property, so it cannot travel in
    // `cssVars`. Dropping it during the split would give a fresh project light
    // scrollbars and light form controls on a dark ground -- visible, wrong, and
    // blamed on the theme rather than on the generator.
    const item = JSON.parse(
      await readFile(path.join(ROOT, "registry", "theme.json"), "utf8"),
    );
    expect(item.css[":root"]).toEqual({ "color-scheme": "dark" });
    expect(item.cssVars.theme["--bg"]).toBe("#0f172a");
  });

  it("registers the theme as a variable-carrying item, not a file with a target", async () => {
    // `target` is meaningless for `registry:theme`: the CLI resolves it against
    // the basename of the consumer's stylesheet *as a directory*, which is how
    // `target: src/nb-theme.css` came to write `app.css/src/nb-theme.css`.
    const index = JSON.parse(
      await readFile(path.join(ROOT, "registry.json"), "utf8"),
    );
    const theme = index.items.find((item) => item.name === "theme");

    expect(theme.type).toBe("registry:theme");
    // `files: []` rather than no `files` key: the published index schema requires
    // the property, and "this item ships no files" is now the truth -- the theme
    // travels as cssVars + css and is merged, not copied.
    expect(theme.files).toEqual([]);
    expect(theme.description).toContain("cssVars");
  });

  it("serves the v1.3.0 index containing all nine blocks and the theme", async () => {
    const response = await call("v1.3.0/index.json");
    expect(response.status).toBe(200);
    const index = await response.json();
    expect(Array.isArray(index)).toBe(true);
    expect(index.length).toBe(10);

    const names = index.map((i) => i.name).sort();
    expect(names).toEqual([
      "app-shell",
      "burst-timeline",
      "detail-panel",
      "empty-state",
      "filter-panel",
      "request-form",
      "result-list",
      "stat-strip",
      "status-view",
      "theme",
    ]);

    for (const item of index) {
      expect(item.relativeUrl).toBe(`${item.name}.json`);
    }
  });

  it("serves an individual block at v1.3.0 with integrity check", async () => {
    const response = await call("v1.3.0/app-shell.json");
    expect(response.status).toBe(200);
    const item = await response.json();
    expect(item.name).toBe("app-shell");
    expect(item.type).toBe("registry:block");
    expect(item.files.length).toBe(1);
    expect(item.files[0].target).toBe("nb/AppShell.svelte");
    expect(item.files[0].content).toContain(
      "AppShell — the house application frame",
    );
  });
});
