/**
 * The document is always revalidated; the assets are immutable for a year.
 *
 * Without this, a page response carried an `ETag` and nothing else, and an
 * `ETag` alone leaves the freshness lifetime to the client's guess. That guess
 * is what made a shipped fix invisible: the top bar was made opaque, the
 * container was redeployed, `/` served the new CSS -- and an iPhone home-screen
 * window kept painting the old page, because a standalone web app can hold a
 * document it fetched days ago and never come back for the new one.
 *
 * `no-cache` is not `no-store`: it says "ask me again", and the `ETag` makes the
 * answer a 304 with no body. The files under `_app/immutable/` are hashed, so
 * they keep `public, max-age=31536000, immutable` and a new deploy only
 * changes the names the document points at.
 *
 * Scoped to `text/html`: the registry items served from `/r/*` set their own
 * `no-store`, and anything else with a cache policy has already chosen one.
 */
export async function handle({ event, resolve }) {
  const response = await resolve(event);

  const contentType = response.headers.get("content-type") ?? "";
  if (
    contentType.includes("text/html") &&
    !response.headers.has("cache-control")
  ) {
    response.headers.set("cache-control", "no-cache");
  }

  return response;
}
