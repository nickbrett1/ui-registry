import { readFile } from "node:fs/promises";
import path from "node:path";
import { installBaseFor, installCommand } from "$lib/install.js";

/**
 * The registry, as an MCP server.
 *
 * Until now "browse the registry" was a curl recipe inside the styling rules a
 * generated project carries — i.e. a sentence an agent had to read, understand
 * and then get right by hand. It was the one part of adopting the design system
 * that had no interface: `shadcn-svelte@1.8.1` ships no MCP server and no
 * `registry list` (measured, not assumed), so an agent picking a block had to
 * guess a name from a README.
 *
 * Four tools, each answering a question an agent actually has:
 *
 *   browse_registry   what is there, and at which version
 *   search_registry   which of them is my problem (name, title, description)
 *   get_item          the source, so it can be read rather than installed blind
 *   install_command   the one line that installs it, spelled correctly
 *
 * `install_command` is a tool rather than prose because it is the thing that
 * gets got wrong: the pin goes in the *base* (`/r/v1.12.0`), never in a query,
 * because the CLI appends only `index.json` / `<name>.json` and a query cannot
 * travel through that. An agent that assembles the URL itself is an agent that
 * will do it differently next time.
 *
 * **Transport: JSON-RPC over `POST /mcp`, request/response only.** No SSE, no
 * session state: every call is a read of files that never change, so there is
 * nothing to resume and no per-client state worth keeping (the registry is
 * public — see the /r route for why a gate here would be an illusion). The
 * Streamable HTTP transport allows a server to answer a POST with a JSON body
 * when it has no notifications to push, which is exactly this.
 *
 * The server is hand-rolled rather than SDK-built because it is four read-only
 * tools over JSON files, and a dependency that large would be the biggest thing
 * in the container. It is checked against the *official* client in
 * `tests/mcp.test.js` — compliance is measured, not asserted here.
 */

export const prerender = false;

const ROOT = process.cwd();
const CATALOGUE_FILE = path.join(ROOT, "registry.json");
const VERSIONS_DIR = path.join(ROOT, "registry", "versions");
const MANIFEST_FILE = path.join(VERSIONS_DIR, "manifest.json");
const ITEM_NAME = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * Echoed back when the client asks for something this server does not know.
 * Unlike the CLI pin this is not worth pinning in a variable -- it is the
 * protocol revision this code was written against (2025-06-18).
 */
const PROTOCOL_VERSION = "2025-06-18";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/** Newest version first, by number rather than by string. */
function compareVersions(a, b) {
  const [x, y] = [a.split(".").map(Number), b.split(".").map(Number)];
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

async function context() {
  const [catalogue, manifest] = await Promise.all([
    readJson(CATALOGUE_FILE),
    readJson(MANIFEST_FILE),
  ]);
  const versions = [
    ...new Set((manifest?.items ?? []).map((entry) => entry.version)),
  ].sort(compareVersions);
  return { catalogue, versions, latest: versions.at(-1) ?? null };
}

/** Items as published at one version — the list, without file contents. */
async function itemsAt(version, catalogue) {
  const names = (catalogue?.items ?? []).map((item) => item.name);
  const items = [];
  for (const name of names) {
    if (!ITEM_NAME.test(name)) continue;
    const item = await readJson(
      path.join(VERSIONS_DIR, `v${version}`, `${name}.json`),
    );
    if (!item) continue;
    items.push({
      name: item.name,
      title: item.title,
      type: item.type,
      description: item.description,
      version,
      files: (item.files ?? []).map((file) => ({
        target: file.target,
        path: file.path,
      })),
    });
  }
  return items;
}

const TOOLS = [
  {
    name: "browse_registry",
    title: "Browse the registry",
    description:
      "Every item the registry publishes at a version: name, title, type, description, and the files each one installs. Use this to see what exists; use search_registry when you know roughly what you need.",
    inputSchema: {
      type: "object",
      properties: {
        version: {
          type: "string",
          description:
            "Published version, e.g. 1.12.0. Defaults to the newest.",
        },
      },
    },
  },
  {
    name: "search_registry",
    title: "Search the registry",
    description:
      "Find items by matching the query against their name, title and description (case-insensitive). Returns the same shape as browse_registry.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Words to look for, e.g. 'table' or 'empty state'.",
        },
        version: {
          type: "string",
          description: "Published version. Defaults to the newest.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_item",
    title: "Read one item",
    description:
      "The published item's JSON, including the full content of every file it installs. Read this before suggesting a block so you know its props rather than inferring them from the name.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Item name, e.g. app-shell." },
        version: {
          type: "string",
          description: "Published version. Defaults to the newest.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "install_command",
    title: "The install line",
    description:
      "The exact shell command that installs one or more items at a version. Use it instead of composing the registry URL yourself: the pin belongs in the base URL, and the CLI appends only index.json and <name>.json.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "string" },
          description: "Item names, e.g. ['theme', 'app-shell'].",
        },
        version: {
          type: "string",
          description: "Published version. Defaults to the newest.",
        },
      },
      required: ["items"],
    },
  },
];

/** A tool result is text for the model, and `structuredContent` for the client. */
function textContent(text, structured) {
  return {
    content: [{ type: "text", text }],
    ...(structured === undefined ? {} : { structuredContent: structured }),
  };
}

function describeItem(item) {
  const files = item.files
    .map(
      (file) => `  - ${file.target}${file.path ? ` (from ${file.path})` : ""}`,
    )
    .join("\n");
  return `## ${item.name} — ${item.title} (v${item.version})\n${item.type}\n\n${item.description}\n\nfiles:\n${files}`;
}

async function callTool(name, args, origin) {
  const { catalogue, versions, latest } = await context();
  const version = args?.version ?? latest;

  if (!version) {
    throw new Error(
      "nothing is published yet: registry/versions/manifest.json is missing or empty. " +
        "Run `npm run publish:release <version>`.",
    );
  }
  if (!SEMVER.test(version) || !versions.includes(version)) {
    throw new Error(
      `no such version: ${version}. Published: ${versions.join(", ") || "none"}.`,
    );
  }

  if (name === "browse_registry" || name === "search_registry") {
    const all = await itemsAt(version, catalogue);
    const query = (args?.query ?? "").trim().toLowerCase();
    const items =
      name === "search_registry" && query
        ? all.filter((item) =>
            [item.name, item.title, item.description].some((field) =>
              (field ?? "").toLowerCase().includes(query),
            ),
          )
        : all;

    if (items.length === 0) {
      const known = all.map((item) => item.name).join(", ");
      return textContent(
        `Nothing at v${version} matches "${args?.query}". Known items: ${known}.`,
        { version, items: [] },
      );
    }
    return textContent(
      [
        `${items.length} item(s) at v${version}:`,
        "",
        ...items.map(describeItem),
      ].join("\n"),
      { version, items },
    );
  }

  if (name === "get_item") {
    const itemName = args?.name ?? "";
    if (!ITEM_NAME.test(itemName))
      throw new Error(`not an item name: ${itemName}`);
    const item = await readJson(
      path.join(VERSIONS_DIR, `v${version}`, `${itemName}.json`),
    );
    if (!item) {
      const known = (await itemsAt(version, catalogue))
        .map((entry) => entry.name)
        .join(", ");
      throw new Error(`no item "${itemName}" at v${version}. Known: ${known}.`);
    }
    return textContent(JSON.stringify(item, null, 2), item);
  }

  if (name === "install_command") {
    const requested = args?.items ?? [];
    if (!Array.isArray(requested) || requested.length === 0) {
      throw new Error("items must be a non-empty array of item names");
    }
    for (const itemName of requested) {
      if (!ITEM_NAME.test(itemName))
        throw new Error(`not an item name: ${itemName}`);
    }
    const available = new Set(
      (await itemsAt(version, catalogue)).map((entry) => entry.name),
    );
    const missing = requested.filter((itemName) => !available.has(itemName));
    if (missing.length > 0) {
      throw new Error(
        `${missing.join(", ")} not published at v${version}. Known: ${[...available].join(", ")}.`,
      );
    }
    // The host, never the pin: the pin goes in the base URL, because the CLI
    // appends only index.json / <name>.json and a query cannot survive that.
    // Both the base and the line come from $lib/install.js, which is also what
    // the pages print -- one spelling, so a reader and a model cannot be told
    // two different commands for the same release.
    const base = installBaseFor(origin, version);
    const command = installCommand({ base, items: requested });
    return textContent(command, { version, base, items: requested, command });
  }

  throw new Error(`unknown tool: ${name}`);
}

async function handle(message, origin) {
  const { id, method, params } = message;

  // Notifications (no id) are acknowledged by the transport, never answered.
  if (id === undefined) return null;

  if (method === "initialize") {
    // Counted, not written down: this sentence said "eleven blocks" until the
    // catalogue served fourteen, and it is the first thing a model reads.
    const { catalogue } = await context();
    const blockCount = (catalogue?.items ?? []).filter(
      (item) => item.type === "registry:block",
    ).length;
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "ui-registry", version: "1.0.0" },
      instructions:
        `The house design system: one theme and ${blockCount} blocks. Browse or search, read the item ` +
        "you want with get_item, then install it with the command install_command returns.",
    });
  }

  if (method === "ping") return rpcResult(id, {});

  if (method === "tools/list") return rpcResult(id, { tools: TOOLS });

  if (method === "tools/call") {
    const name = params?.name;
    try {
      const result = await callTool(name, params?.arguments ?? {}, origin);
      return rpcResult(id, result);
    } catch (error) {
      // A tool that fails is a *result* with isError, not a JSON-RPC error: the
      // model should see the message and try again, rather than the client
      // treating the server as broken.
      return rpcResult(id, {
        isError: true,
        content: [{ type: "text", text: error.message }],
      });
    }
  }

  if (method === "resources/list") return rpcResult(id, { resources: [] });
  if (method === "prompts/list") return rpcResult(id, { prompts: [] });

  return rpcError(id, -32601, `method not found: ${method}`);
}

export async function POST({ request, url }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, rpcError(null, -32700, "parse error"));
  }

  const origin = `${url.protocol}//${url.host}`;

  if (Array.isArray(body)) {
    const answers = (
      await Promise.all(body.map((message) => handle(message, origin)))
    ).filter(Boolean);
    return answers.length
      ? json(200, answers)
      : new Response(null, { status: 202 });
  }

  const answer = await handle(body, origin);
  return answer ? json(200, answer) : new Response(null, { status: 202 });
}

/**
 * A GET is what a human types at the URL. There is no SSE stream to open, so it
 * says what this is rather than hanging.
 */
export async function GET() {
  return json(200, {
    server: "ui-registry",
    transport: "json-rpc over POST /mcp (no stream, no session)",
    tools: TOOLS.map((tool) => ({ name: tool.name, title: tool.title })),
  });
}
