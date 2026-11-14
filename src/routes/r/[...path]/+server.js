import { readFile, realpath, stat } from "node:fs/promises";
import { createHash, timingSafeEqual } from "node:crypto";
import path from "node:path";

/**
 * The registry endpoint.
 *
 * `GET /r/registry.json` -> the index, `GET /r/<name>.json?version=x.y.z` -> one
 * item. This is a ROUTE and not a static directory on purpose: a static file
 * cannot check a bearer token, and moving the check to a reverse proxy is the
 * hand-made path the design note rejected (design note §3.6.6). Do not
 * "simplify" it back.
 *
 * Everything here is gated, index included. The repo being public and the served
 * registry being gated are independent decisions and both are deliberate.
 *
 * Items are **version-addressed and immutable** (design note §3.5, §3.6.7 item
 * 3). There is deliberately no unversioned item route: a design system that
 * mutates under a live project is worse than a stale one, so `?version=` is
 * required and an unknown version is a 404 rather than a quiet fall-back to
 * whatever happens to be on disk. Publishing is a separate, explicit act --
 * `npm run publish:item <name> <version>` -- that writes a frozen copy plus a
 * digest into `registry/versions/manifest.json`; the digest is checked on every
 * read, so a published version that is edited in place serves a 500, not a
 * silent change.
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
 * `.css` is kept for the `/r/styles/nb.css` shape the design note sketches; no
 * such file is published today.
 */
const ALLOWED_EXTENSIONS = new Set([".json", ".css"]);

/** Published items are flat: `<name>.json` at a version. Never nested. */
const ITEM_NAME = /^[a-z0-9][a-z0-9-]*\.json$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

const UNAUTHORIZED_HEADERS = {
  "www-authenticate": 'Bearer realm="nb-registry"',
  "cache-control": "no-store",
};

/** 401 with no body: do not tell an unauthenticated caller what does or does not exist. */
function unauthorized() {
  return new Response(null, { status: 401, headers: UNAUTHORIZED_HEADERS });
}

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
 * Constant-time comparison. Both sides are hashed first so that length is not a
 * leaking channel (`timingSafeEqual` throws on differing lengths).
 */
function constantTimeEquals(a, b) {
  const left = createHash("sha256").update(a, "utf8").digest();
  const right = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}

/** @returns {"ok" | "denied" | "unconfigured"} */
function checkAuthorization(request) {
  const expected = process.env.NB_REGISTRY_TOKEN;
  // Fail closed *and* loudly. A missing secret must not read as "the route is
  // broken", and it must not read as "authorised" either.
  if (!expected) return "unconfigured";

  const header = request.headers.get("authorization");
  if (!header) return "denied";

  const match = /^Bearer +(.+)$/i.exec(header.trim());
  if (!match) return "denied";

  return constantTimeEquals(match[1], expected) ? "ok" : "denied";
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
  const authorization = checkAuthorization(request);

  if (authorization === "unconfigured") {
    console.error(
      "[/r] NB_REGISTRY_TOKEN is not set - refusing to serve the registry. " +
        "It is expected from Doppler; see README.",
    );
    return new Response("registry not configured\n", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (authorization !== "ok") return unauthorized();

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
