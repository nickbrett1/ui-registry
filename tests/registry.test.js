import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFile, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
import { GET } from "../src/routes/r/[...path]/+server.js";

const ROOT = path.resolve(process.cwd());
const TOKEN = "test-token-not-a-real-secret";

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

beforeEach(() => {
  process.env.NB_REGISTRY_TOKEN = TOKEN;
});

function call(segments, authorization) {
  const headers = authorization === undefined ? {} : { authorization };
  const request = new Request(`http://localhost/r/${segments ?? ""}`, { headers });
  return GET({ params: { path: segments ?? "" }, request });
}

const withBearer = () => `Bearer ${TOKEN}`;

describe("GET /r - authorisation", () => {
  it("serves the index to a valid bearer token", async () => {
    const response = await call("registry.json", withBearer());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = await response.json();
    expect(body.name).toBe("nb");
    expect(body.items.map((item) => item.name)).toEqual(["theme"]);
  });

  it("treats a bare /r as the index", async () => {
    const response = await call("", withBearer());
    expect(response.status).toBe(200);
    expect((await response.json()).name).toBe("nb");
  });

  it("returns 401 with no Authorization header", async () => {
    const response = await call("registry.json");
    expect(response.status).toBe(401);
    // No body: an unauthenticated caller must not learn whether a file exists.
    expect(await response.text()).toBe("");
  });

  it("returns 401 with a wrong token", async () => {
    const response = await call("registry.json", "Bearer wrong-token");
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
  });

  it("returns 401 for a token of a different length", async () => {
    // Guards the constant-time compare: `timingSafeEqual` throws on length mismatch
    // unless both sides are hashed first, and a throw would be a 500, not a 401.
    const response = await call("registry.json", `Bearer ${TOKEN}x`);
    expect(response.status).toBe(401);
  });

  it("returns 401 for a non-bearer scheme", async () => {
    expect((await call("registry.json", `Basic ${TOKEN}`)).status).toBe(401);
  });

  it("returns 401 for an empty bearer value", async () => {
    expect((await call("registry.json", "Bearer ")).status).toBe(401);
  });

  it("gates the item documents too, not just the index", async () => {
    expect((await call("theme.json")).status).toBe(401);
  });

  it("fails closed and loudly when the token is not configured", async () => {
    delete process.env.NB_REGISTRY_TOKEN;
    const response = await call("registry.json", withBearer());
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("not configured");
  });
});

describe("GET /r - documents", () => {
  it("serves the theme item with its CSS inlined", async () => {
    const response = await call("theme.json", withBearer());
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.type).toBe("registry:theme");
    expect(body.files).toHaveLength(1);
    expect(body.files[0].target).toBe("src/app.css");
    expect(body.files[0].content).toContain("--bg: #0f172a");
  });

  it("returns 404 for an item that does not exist", async () => {
    const response = await call("nope.json", withBearer());
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("not found");
  });

  it("serves nothing with an extension outside the allowlist", async () => {
    const response = await call("__test__.txt", withBearer());
    expect(response.status).toBe(404);
  });

  it("refuses a directory", async () => {
    expect((await call("__testdir__", withBearer())).status).toBe(404);
  });

  it("serves a nested .json inside the registry tree", async () => {
    expect((await call("__testdir__/inside.json", withBearer())).status).toBe(200);
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

  it.each(attacks)("refuses %s", async (attack) => {
    const response = await call(attack, withBearer());
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("root:x:");
  });

  it("refuses a symlink that points out of the registry tree", async () => {
    const response = await call("__testlink__.json", withBearer());
    expect(response.status).toBe(404);
  });

  it("refuses malformed percent-encoding instead of throwing", async () => {
    const response = await call("%zz.json", withBearer());
    expect(response.status).toBe(404);
  });

  it("refuses a NUL byte", async () => {
    const response = await call("theme.json%00.png", withBearer());
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
