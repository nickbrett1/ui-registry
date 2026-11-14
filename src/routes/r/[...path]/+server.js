import { readFile, realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

/**
 * The registry endpoint.
 *
 * `GET /r/registry.json` -> the index, `GET /r/<name>.json?version=x.y.z` -> one
 * item. This is a ROUTE and not a static directory on purpose: it has to resolve
 * a version against a manifest and verify digests, which a static file cannot do
 * (design note §3.6.6). Do not "simplify" it back.
 *
 * **The endpoint is PUBLIC — decided deliberately 2026-11-14.** There is no
 * bearer token, and that is not an oversight: `shadcn-svelte@1.8.1` sends no
 * auth headers at all (no `Authorization`, no `registries` map, no namespaces —
 * verified against the published bundle), so a gated registry is *unconsumable*
 * by the only CLI that would use it. The token was designed on an assumption
 * that turned out to be false, and a gate that no client can pass protects
 * nothing but the illusion of one.
 *
 * What actually protects this endpoint, in order of what a reader should trust:
 *   1. **The source is public anyway.** The repo is public and the served items
 *      are committed to it, so nothing here is a secret. Gating the endpoint was
 *      never what kept the theme private.
 *   2. **Immutability.** Items are version-addressed and checked against a
 *      digest in `registry/versions/manifest.json` on every read, so the risk
 *      that matters — a design system changing under a live project — is caught
 *      whether or not the caller is authenticated.
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
 * `.css` is kept for the `/r/styles/nb.css` shape the design note sketches.
 */
const ALLOWED_EXTENSIONS = new Set([".json", ".css"]);

/** Published items are flat: `<name>.json` at a version. Never nested. */
const ITEM_NAME = /^[a-z0-9][a-z0-9-]*\.json$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

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

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function GET({ params, request }) {
  const requested = params.path ?? "";
  const url = new URL(request.url);

  // `/r` and `/r/` both mean the index, and it is the one document that lives
  // outside REGISTRY_DIR (at the repo root, where `shadcn-svelte` expects it).
  // The index is a live catalogue, not an artifact, so it is always current and
  // it is the one place that says which versions exist.
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

  const version = url.searchParams.get("version");
  const manifest = await readManifest();
  const available = publishedVersions(manifest);

  if (!version) return jsonError(400, "version required", { available });
  if (!SEMVER.test(version)) return jsonError(400, "invalid version", { available });
  if (!ITEM_NAME.test(requested)) return jsonError(404, "not found");

  const entry = (manifest?.items ?? []).find(
    (candidate) =>
      candidate.name === requested.replace(/\.json$/, "") && candidate.version === version,
  );
  // Unknown (name, version) is a 404, not a fall-back. A consumer pinned to
  // v1.0.0 must either get v1.0.0 or fail loudly.
  if (!entry) return jsonError(404, "not found", { available });

  const file = await resolveInsideRoot(VERSIONS_DIR, path.join(`v${version}`, requested));
  if (!file) return jsonError(404, "not found");

  let body;
  try {
    body = await readFile(file);
  } catch {
    return jsonError(404, "not found");
  }

  const digest = createHash("sha256").update(body).digest("hex");
  if (digest !== entry.sha256) {
    console.error(
      `[/r] integrity check failed for ${requested} at v${version}: ` +
        `expected ${entry.sha256}, read ${digest}. A published version has been edited in place.`,
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
