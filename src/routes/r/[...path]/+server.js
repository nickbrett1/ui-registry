import { readFile, realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

/**
 * The registry endpoint.
 *
 * Three shapes, because three different clients ask three different questions:
 *
 *   GET /r/registry.json                              the live catalogue
 *   GET /r/<name>.json?version=x.y.z                  one item, pinned by query
 *   GET /r/v<x.y.z>/index.json                        the index at a version
 *   GET /r/v<x.y.z>/<name>.json                       one item, pinned by path
 *   GET /r/v<x.y.z>/styles/<style>/index.json         the same two, style-prefixed
 *   GET /r/v<x.y.z>/styles/<style>/<name>.json
 *
 * **The versioned shapes are dictated by `shadcn-svelte@1.8.1`, measured rather
 * than assumed** (`2026-11-14`, by running it against this endpoint). It builds
 * its URLs from a base and appends nothing but `index.json` / `<name>.json`
 * when the base comes from `COMPONENTS_REGISTRY_URL`; only the fallback path
 * (no env var) inserts `/styles/<style>/`. So both spellings are served. A
 * query parameter cannot travel through either, which is why the pin lives in
 * the base URL — `COMPONENTS_REGISTRY_URL=https://<host>/r/v1.1.0` — a better
 * home for it anyway: explicit, greppable, an operator knob rather than
 * something baked into a project.
 *
 * **The four-hundredth attempt at guessing the index shape cost a round trip;
 * do not guess again.** The CLI parses `<base>/index.json` as a plain JSON
 * **array** whose entries carry `relativeUrl`, then fetches each `relativeUrl`
 * for the item body. A `{name, items: [...]}` document — which is what the
 * `registry.json` *file* looks like — is rejected with `ZodError: expected
 * array`. Hence `projectIndex` below, which builds that array from the frozen
 * items at a version.
 *
 * **The endpoint is PUBLIC — decided deliberately 2026-11-14.** There is no
 * bearer token, and that is not an oversight: that same CLI sends no auth
 * headers at all (no `Authorization`, no `registries` map, no namespaces —
 * verified against the published bundle), so a gated registry is *unconsumable*
 * by the only CLI that would use it. A gate no client can pass protects nothing
 * but the illusion of one.
 *
 * What actually protects this endpoint:
 *   1. **The source is public anyway.** The repo is public and the served items
 *      are committed to it, so nothing here is a secret.
 *   2. **Immutability.** Every read is checked against a digest in
 *      `registry/versions/manifest.json`, so the risk that matters — a design
 *      system changing under a live project — is caught whether or not the
 *      caller is authenticated.
 *   3. **Containment.** `[...path]` is attacker-controlled; see
 *      `resolveInsideRoot` below.
 *
 * If a gate is ever wanted again, it must arrive with a client that can send a
 * header. Putting it back "because the design note said so" would re-break
 * consumption, which is what the gate did the first time.
 */

export const prerender = false;

/** The working tree items are built into. Versioned, published copies live under it. */
const REGISTRY_DIR = path.resolve(process.cwd(), "registry");
const INDEX_FILE = path.resolve(process.cwd(), "registry.json");
const VERSIONS_DIR = path.join(REGISTRY_DIR, "versions");
const MANIFEST_FILE = path.join(VERSIONS_DIR, "manifest.json");

/**
 * Defence in depth. Containment below is the real guard; the extension allowlist
 * means a mistake in it cannot turn into "serve the container's whole filesystem".
 */
const ALLOWED_EXTENSIONS = new Set([".json", ".css"]);

/** Published items are flat: `<name>.json` at a version. Never nested. */
const ITEM_NAME = /^[a-z0-9][a-z0-9-]*\.json$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * The CLI-compatible shape. The `<style>` segment is accepted and **ignored**:
 * this registry publishes one theme, not a style matrix, and `index.json` /
 * `<name>.json` are the only things a style directory can meaningfully contain
 * here. Rejecting unknown style names would break the CLI for no gain; the
 * segment is validated as a segment, not as a name we recognise.
 */
const VERSIONED_PREFIX =
  /^v(\d+\.\d+\.\d+)\/(?:styles\/[a-z0-9][a-z0-9-]*\/)?(index\.json|[a-z0-9][a-z0-9-]*\.json)$/;

function jsonError(status, error, extra = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * Resolve `requested` under `root`, or return null if it escapes.
 *
 * `[...path]` is attacker-controlled, so three things are checked and all of
 * them must hold:
 *   1. the syntactically resolved path is inside root (catches `../` and absolute paths),
 *   2. the realpath -- symlinks followed -- is still inside the real root
 *      (catches a committed symlink pointing at /etc),
 *   3. it is a regular file with an allowed extension.
 */
async function resolveInsideRoot(root, requested) {
  let decoded;
  try {
    decoded = decodeURIComponent(requested);
  } catch {
    return null; // malformed percent-encoding
  }

  if (decoded.includes("\0")) return null;

  const candidate = path.resolve(root, decoded);
  if (!isInside(root, candidate)) return null;

  let resolved;
  try {
    resolved = await realpath(candidate);
  } catch {
    return null; // does not exist
  }

  let realRoot;
  try {
    realRoot = await realpath(root);
  } catch {
    return null; // the root itself is missing - nothing is servable
  }
  if (!isInside(realRoot, resolved)) return null;

  let info;
  try {
    info = await stat(resolved);
  } catch {
    return null;
  }
  if (!info.isFile()) return null;

  if (!ALLOWED_EXTENSIONS.has(path.extname(resolved).toLowerCase())) return null;

  return resolved;
}

function isInside(root, target) {
  return target === root || target.startsWith(root + path.sep);
}

async function readManifest() {
  let raw;
  try {
    raw = await readFile(MANIFEST_FILE, "utf8");
  } catch {
    return null; // no manifest yet: nothing is published
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function publishedVersions(manifest) {
  return [...new Set((manifest?.items ?? []).map((entry) => entry.version))].sort();
}

/**
 * Read a frozen document, check it against the digest the manifest recorded, and
 * answer. Every served artifact goes through here, so "immutable" is one code
 * path rather than three copies of an intention.
 */
async function serveFrozen({ storedPath, expectedSha256, version, label }) {
  const file = await resolveInsideRoot(VERSIONS_DIR, storedPath);
  if (!file) return jsonError(404, "not found");

  let body;
  try {
    body = await readFile(file);
  } catch {
    return jsonError(404, "not found");
  }

  const digest = createHash("sha256").update(body).digest("hex");
  if (digest !== expectedSha256) {
    console.error(
      `[/r] integrity check failed for ${label} at v${version}: ` +
        `expected ${expectedSha256}, read ${digest}. A published version has been edited in place.`,
    );
    return jsonError(500, "integrity check failed");
  }

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-registry-version": version,
      // The document is immutable, so the digest is a valid strong validator.
      etag: `"${digest}"`,
    },
  });
}

/**
 * The index at a version, derived from that version's **frozen** items.
 *
 * This is deliberately not a stored artifact. A stored index would have to be
 * written at publish time from the live catalogue, and the one thing that cannot
 * be re-derived later without lying is exactly what it must not lie about: an
 * index written today for an older version would describe it with a `target` it
 * never shipped. Projecting from the frozen bytes cannot drift, because the
 * bytes are the only input - and each one is digest-checked on the way in, so a
 * tampered item fails the whole index with a 500 rather than being described
 * confidently.
 *
 * The shape is the CLI's (`shadcn-svelte@1.8.1`): a **JSON array**, each entry
 * carrying `relativeUrl`, which the CLI then fetches for the item body.
 */
async function projectIndex(version, manifest) {
  const available = publishedVersions(manifest);
  const entries = (manifest?.items ?? [])
    .filter((candidate) => candidate.version === version)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (entries.length === 0) return jsonError(404, "not found", { available });

  const documents = [];
  for (const entry of entries) {
    const file = await resolveInsideRoot(VERSIONS_DIR, path.join(`v${version}`, `${entry.name}.json`));
    if (!file) return jsonError(404, "not found", { available });

    let body;
    try {
      body = await readFile(file);
    } catch {
      return jsonError(404, "not found", { available });
    }

    const digest = createHash("sha256").update(body).digest("hex");
    if (digest !== entry.sha256) {
      console.error(
        `[/r] integrity check failed for ${entry.name}.json at v${version}: ` +
          `expected ${entry.sha256}, read ${digest}. A published version has been edited in place.`,
      );
      return jsonError(500, "integrity check failed");
    }

    const item = JSON.parse(body.toString("utf8"));
    // Only the fields an index entry is defined to carry. Not `files`: the CLI
    // fetches the item itself, and a second copy of the theme inside the index
    // would be one more thing to keep in step.
    const projected = {
      name: item.name ?? entry.name,
      type: item.type,
      relativeUrl: `${entry.name}.json`,
    };
    if (item.title) projected.title = item.title;
    if (item.description) projected.description = item.description;
    documents.push(projected);
  }

  return new Response(JSON.stringify(documents), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-registry-version": version,
    },
  });
}

/** @returns {Promise<Response>} */
async function serveVersioned(version, file, manifest) {
  const available = publishedVersions(manifest);

  if (file === "index.json") return projectIndex(version, manifest);

  const itemName = file.replace(/\.json$/, "");
  const entry = (manifest?.items ?? []).find(
    (candidate) => candidate.name === itemName && candidate.version === version,
  );
  if (!entry) return jsonError(404, "not found", { available });

  return serveFrozen({
    storedPath: path.join(`v${version}`, file),
    expectedSha256: entry.sha256,
    version,
    label: file,
  });
}

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function GET({ params, request }) {
  const requested = params.path ?? "";
  const url = new URL(request.url);

  // `/r` and `/r/` both mean the index, and it is the one document that lives
  // outside REGISTRY_DIR (at the repo root, where `shadcn-svelte` expects it).
  // The live catalogue is not an artifact: it is always current, and it is the
  // one place that says which versions exist.
  const isIndex = requested === "" || requested === "/" || requested === "registry.json";

  if (isIndex) {
    let body;
    try {
      body = await readFile(INDEX_FILE);
    } catch {
      return jsonError(404, "not found");
    }

    const manifest = await readManifest();
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-registry-versions": publishedVersions(manifest).join(", "),
      },
    });
  }

  // The CLI shape: the version and the style both live in the path.
  const versioned = VERSIONED_PREFIX.exec(requested);
  if (versioned) {
    const manifest = await readManifest();
    return serveVersioned(versioned[1], versioned[2], manifest);
  }

  // The HTTP shape: `?version=` explicitly. Same documents, same checks.
  const version = url.searchParams.get("version");
  const manifest = await readManifest();
  const available = publishedVersions(manifest);

  // A path that is not a published item name is "not found" whether or not a
  // version was supplied: asking for `/r/../../etc/passwd` should not be told
  // which versions exist, and a traversal attempt is not a client that forgot
  // to pin. Only a well-formed item name earns the "version required" answer.
  if (!ITEM_NAME.test(requested)) return jsonError(404, "not found");

  if (!version) return jsonError(400, "version required", { available });
  if (!SEMVER.test(version)) return jsonError(400, "invalid version", { available });

  const entry = (manifest?.items ?? []).find(
    (candidate) =>
      candidate.name === requested.replace(/\.json$/, "") && candidate.version === version,
  );
  // Unknown (name, version) is a 404, not a fall-back. A consumer pinned to
  // v1.0.0 must either get v1.0.0 or fail loudly.
  if (!entry) return jsonError(404, "not found", { available });

  return serveFrozen({
    storedPath: path.join(`v${version}`, requested),
    expectedSha256: entry.sha256,
    version,
    label: requested,
  });
}
