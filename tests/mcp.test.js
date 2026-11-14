import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST, GET } from "../src/routes/mcp/+server.js";

/**
 * Two kinds of test, on purpose.
 *
 * The direct calls below pin *this registry's* answers: which items exist, that
 * the install line puts the pin in the base, that a bad version says which
 * versions do exist.
 *
 * The client test pins something else and more important: that a real MCP client
 * can talk to the server at all. The protocol is detailed enough to be
 * wrong in ways that only show up when something else implements the other side,
 * and this repo has already paid once for guessing a wire shape instead of
 * measuring it (the `index.json` array, in the /r route). So the client here is
 * the official SDK's, used as a *client* -- the server stays dependency-free.
 */

function call(message) {
  return POST({
    request: new Request("http://127.0.0.1:4173/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(message),
    }),
    url: new URL("http://127.0.0.1:4173/mcp"),
  });
}

async function tool(name, args) {
  const response = await call({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const body = await response.json();
  return body.result;
}

describe("POST /mcp", () => {
  it("initialises and lists four tools", async () => {
    const init = await (
      await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })
    ).json();
    expect(init.result.serverInfo.name).toBe("ui-registry");
    expect(init.result.capabilities.tools).toBeDefined();

    const list = await (
      await call({ jsonrpc: "2.0", id: 2, method: "tools/list" })
    ).json();
    expect(list.result.tools.map((entry) => entry.name)).toEqual([
      "browse_registry",
      "search_registry",
      "get_item",
      "install_command",
    ]);
  });

  it("browses the newest published version", async () => {
    const result = await tool("browse_registry", {});
    // The newest version is a release, so it holds the whole catalogue -- one
    // theme and every block. Derived, not a literal: this is the same "count
    // that goes stale" trap as the gallery's list of names.
    // `process.cwd()` rather than `import.meta.url`: under jsdom the module URL
    // resolves to the dev-server origin, not a file (same trap as tokens.test.js).
    const catalogue = JSON.parse(
      readFileSync(resolve(process.cwd(), "registry.json"), "utf8"),
    );
    expect(
      result.structuredContent.items.map((item) => item.name).sort(),
    ).toEqual(catalogue.items.map((item) => item.name).sort());
    expect(result.structuredContent.items.map((item) => item.name)).toContain(
      "app-shell",
    );
    expect(result.content[0].text).toContain("app-shell");
  });

  it("searches descriptions, and says what exists when nothing matches", async () => {
    const found = await tool("search_registry", { query: "table" });
    expect(found.structuredContent.items.map((item) => item.name)).toEqual([
      "data-table",
    ]);

    const none = await tool("search_registry", { query: "carousel" });
    expect(none.structuredContent.items).toEqual([]);
    expect(none.content[0].text).toContain("Known items:");
  });

  it("reads an item including its file contents", async () => {
    const result = await tool("get_item", { name: "app-shell" });
    expect(result.structuredContent.files[0].content).toContain("<script");
    expect(result.structuredContent.files[0].target).toBe("nb/AppShell.svelte");
  });

  it("puts the pin in the base, never in a query", async () => {
    const result = await tool("install_command", {
      items: ["theme", "app-shell"],
      version: "1.12.0",
    });
    expect(result.structuredContent.command).toBe(
      'COMPONENTS_REGISTRY_URL="http://127.0.0.1:4173/r/v1.12.0" npx shadcn-svelte@1.8.1 add theme app-shell --yes --overwrite',
    );
  });

  it("treats a bad version or item as a tool error the model can read", async () => {
    const badVersion = await tool("browse_registry", { version: "9.9.9" });
    expect(badVersion.isError).toBe(true);
    expect(badVersion.content[0].text).toContain("Published:");

    const badItem = await tool("get_item", { name: "nope" });
    expect(badItem.isError).toBe(true);
    expect(badItem.content[0].text).toContain("no item");
  });

  it("acknowledges notifications without answering them", async () => {
    const response = await call({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(response.status).toBe(202);
  });

  it("rejects an unknown method with -32601", async () => {
    const body = await (
      await call({ jsonrpc: "2.0", id: 9, method: "wat" })
    ).json();
    expect(body.error.code).toBe(-32601);
  });
});

describe("a real MCP client", () => {
  let server;
  let client;

  beforeAll(async () => {
    // The SDK transport needs a URL, so the handler is bridged to one. Nothing
    // about the bridge is what is under test; it is only the wire.
    server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const url = `http://127.0.0.1:${server.address().port}/mcp`;
      const answer = await POST({
        request: new Request(url, {
          method: request.method,
          headers: request.headers,
          body: request.method === "POST" ? Buffer.concat(chunks) : undefined,
        }),
        url: new URL(url),
      });
      response.writeHead(answer.status, Object.fromEntries(answer.headers));
      response.end(
        answer.body ? Buffer.from(await answer.arrayBuffer()) : undefined,
      );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${server.address().port}/mcp`),
    );
    client = new Client({ name: "ui-registry-test", version: "1.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client?.close();
    await new Promise((resolve) => server.close(resolve));
  });

  it("connects, lists tools and calls one", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((entry) => entry.name)).toContain("install_command");

    const result = await client.callTool({
      name: "search_registry",
      arguments: { query: "empty" },
    });
    expect(result.structuredContent.items[0].name).toBe("empty-state");
  });
});

describe("GET /mcp", () => {
  it("says what the endpoint is instead of hanging on a stream", async () => {
    const body = await (await GET()).json();
    expect(body.transport).toContain("no stream");
    expect(body.tools).toHaveLength(4);
  });
});
