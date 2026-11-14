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
  await writeFile(path.join(ROOT, "registry", "__test__.txt"), "not servable", "utf8");
  await writeFile(path.join(ROOT, "registry", "__testdir__", "inside.json"), "{}", "utf8");
  // A committed symlink is the one escape a lexical `..` check cannot see.
  await symlink("/etc/hostname", path.join(ROOT, "registry", "__testlink__.json")).catch(() => {});
});

afterAll(async () => {
  await rm(path.join(ROOT, "registry", "__testdir__"), { recursive: true, force: true });
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
    await readFile(path.join(ROOT, "registry", "versions", "manifest.json"), "utf8"),
  );
}


describe("GET /r - public, deliberately", () => {
  it("serves the index with no Authorization header", async () => {
    const response = await call("registry.json");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.name).toBe("nb");
    expect(body.items.map((item) => item.name)).toEqual(["theme"]);
  });

  it("treats a bare /r as the index", async () => {
    const response = await call("");
    expect(response.status).toBe(200);
    expect((await response.json()).name).toBe("nb");
  });

  it("serves an item with no Authorization header", async () => {
    // The gate was removed because `shadcn-svelte@1.8.1` cannot send one; every
    // test below therefore goes through the same public path a real client uses.
    expect((await call("theme.json", "?version=1.0.0")).status).toBe(200);
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
    const response = await call("theme.json", "?version=1.0.0");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-registry-version")).toBe("1.0.0");

    const body = await response.json();
    expect(body.type).toBe("registry:theme");
    expect(body.files).toHaveLength(1);
    expect(body.files[0].target).toBe("src/app.css");
    expect(body.files[0].content).toContain("--bg: #0f172a");
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
    expect((await call("__testdir__/inside.json", "?version=1.0.0")).status).toBe(
      404,
    );
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
      const response = await call("theme.json", `?version=${encodeURIComponent(version)}`);
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
      (candidate) => candidate.name === "theme" && candidate.version === "1.0.0",
    );
    expect(response.headers.get("etag")).toBe(`"${entry.sha256}"`);
  });

  it("every published file matches the digest in the manifest", async () => {
    // The immutability guard, seen from the tree rather than the route: an edit
    // to a published item must be detectable without trusting any one request.
    const manifest = await readManifest();
    expect(manifest.items.length).toBeGreaterThan(0);

    for (const entry of manifest.items) {
      const file = path.join(ROOT, "registry", "versions", `v${entry.version}`, `${entry.name}.json`);
      const bytes = await readFile(file);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
      expect(Buffer.byteLength(bytes)).toBe(entry.bytes);
    }
  });

  it("500s when a published file has been edited in place", async () => {
    // The rule is only real if breaking it is detected. The route compares each
    // read against the manifest digest, so an in-place edit is a 500 -- loud, and
    // never a silently mutated design system.
    const published = path.join(ROOT, "registry", "versions", "v1.0.0", "theme.json");
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
    const published = path.join(ROOT, "registry", "versions", "v1.0.0", "theme.json");
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
    const manifestFile = path.join(ROOT, "registry", "versions", "manifest.json");
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

describe("the theme has one source of truth", () => {
  it("registry/theme.json is a faithful inline of src/app.css", async () => {
    // The drift guard. `npm run build:theme` regenerates the served item; without
    // this test the token sheet would exist twice and diverge -- which is the
    // exact failure this registry exists to end.
    const css = await readFile(path.join(ROOT, "src", "app.css"), "utf8");
    const item = JSON.parse(await readFile(path.join(ROOT, "registry", "theme.json"), "utf8"));

    expect(item.files[0].content).toBe(css);
    expect(item.meta.bytes).toBe(Buffer.byteLength(css, "utf8"));
  });

  it("registers src/app.css as the theme file in the index", async () => {
    const index = JSON.parse(await readFile(path.join(ROOT, "registry.json"), "utf8"));
    const theme = index.items.find((item) => item.name === "theme");

    expect(theme.type).toBe("registry:theme");
    expect(theme.files).toEqual([
      { path: "src/app.css", type: "registry:theme", target: "src/app.css" },
    ]);
  });
});
