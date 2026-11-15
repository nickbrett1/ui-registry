import { describe, expect, it } from "vitest";
import { handle } from "../src/hooks.server.js";

/** A stand-in for SvelteKit's `resolve`: returns the response under test. */
function resolved(headers) {
  return () => new Response("<html></html>", { headers });
}

const EVENT = { url: new URL("http://ryzen:3012/") };

describe("cache headers", () => {
  it("makes the document revalidate instead of being guessed at", async () => {
    // The defect: `/` was served with an ETag and no Cache-Control, so a
    // home-screen web app could keep an old document indefinitely -- which is
    // how a deployed fix stayed invisible on the phone.
    const response = await handle({
      event: EVENT,
      resolve: resolved({ "content-type": "text/html" }),
    });

    expect(response.headers.get("cache-control")).toBe("no-cache");
  });

  it("leaves the immutable hashed assets alone", async () => {
    const immutable = "public,max-age=31536000,immutable";
    const response = await handle({
      event: EVENT,
      resolve: resolved({
        "content-type": "text/css",
        "cache-control": immutable,
      }),
    });

    expect(response.headers.get("cache-control")).toBe(immutable);
  });

  it("does not overwrite a policy a route already chose", async () => {
    // /r/* and /mcp answer with `no-store`, which is stricter than `no-cache`.
    const response = await handle({
      event: EVENT,
      resolve: resolved({
        "content-type": "text/html",
        "cache-control": "no-store",
      }),
    });

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
