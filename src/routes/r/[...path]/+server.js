import { readFile, realpath, stat } from "node:fs/promises";
import { createHash, timingSafeEqual } from "node:crypto";
import path from "node:path";

/**
 * The registry endpoint.
 *
 * `GET /r/registry.json` -> the index, `GET /r/<name>.json` -> one item. This is
 * a ROUTE and not a static directory on purpose: a static file cannot check a
 * bearer token, and moving the check to a reverse proxy is the hand-made path the
 * design note rejected (design note §3.6.6). Do not "simplify" it back.
 *
 * Everything here is gated, index included. The repo being public and the served
 * registry being gated are independent decisions and both are deliberate.
 */

export const prerender = false;

/** The tree the served items live in. The index sits beside it, at the root. */
const REGISTRY_DIR = path.resolve(process.cwd(), "registry");
const INDEX_FILE = path.resolve(process.cwd(), "registry.json");

/**
 * Defence in depth. Containment below is the real guard; the extension allowlist
 * means a mistake in it cannot turn into "serve the container's whole filesystem".
 * `.css` is here because the theme is a stylesheet (§3.5.1 /r/styles/nb.css shape);
 * nothing else is served in phase 0b.
 */
const ALLOWED_EXTENSIONS = new Set([".json", ".css"]);

const UNAUTHORIZED_HEADERS = {
  "www-authenticate": 'Bearer realm="nb-registry"',
  "cache-control": "no-store",
};

/** 401 with no body: do not tell an unauthenticated caller what does or does not exist. */
function unauthorized() {
  return new Response(null, { status: 401, headers: UNAUTHORIZED_HEADERS });
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

  const realRoot = await realpath(root).catch(() => null);
  if (!realRoot || !isInside(realRoot, resolved)) return null;

  const info = await stat(resolved).catch(() => null);
  if (!info?.isFile()) return null;

  if (!ALLOWED_EXTENSIONS.has(path.extname(resolved).toLowerCase())) return null;

  return resolved;
}

function isInside(root, target) {
  return target === root || target.startsWith(root + path.sep);
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

  // `/r` and `/r/` both mean the index, and it is the one document that lives
  // outside REGISTRY_DIR (at the repo root, where `shadcn-svelte` expects it).
  const isIndex = requested === "" || requested === "/" || requested === "registry.json";
  const file = isIndex ? INDEX_FILE : await resolveInsideRoot(REGISTRY_DIR, requested);

  if (!file) {
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  let body;
  try {
    body = await readFile(file);
  } catch {
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const contentType = file.endsWith(".css")
    ? "text/css; charset=utf-8"
    : "application/json; charset=utf-8";

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
