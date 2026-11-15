/**
 * The one place the install line is spelled out.
 *
 * A reader who has just looked at a demo wants the command that puts that demo
 * in their repo. There are three ways to get it wrong, and every one of them
 * produces a line that looks right and does nothing:
 *
 * 1. **The pin goes in the base URL, not in a query.** `shadcn-svelte` uses
 *    `COMPONENTS_REGISTRY_URL` verbatim and appends only `index.json` /
 *    `<name>.json`, so `?version=1.2.0` is dropped on the floor and the CLI
 *    silently resolves whatever the host serves.
 * 2. **`--overwrite` is required, and `--yes` is not a substitute.** `add` asks
 *    a second question — "updates to your `src/app.css` are required" — that
 *    `--yes` does not answer; with closed stdin it prints the prompt and exits
 *    `0` having written nothing.
 * 3. **The CLI is pinned.** `1.0.0` and `1.1.0` of the theme shipped a
 *    `files[].target` the CLI resolves *as a directory*, so they wrote
 *    `<project>/app.css/src/nb-theme.css` while printing "theme installed".
 *
 * So the line is built, never typed. The MCP server answers the same question
 * to a model and uses these same two functions, because a second copy of this
 * string is a second copy that can drift.
 */

/** The CLI whose URL shapes `/r` was measured against (see README). */
export const CLI = "shadcn-svelte@1.8.1";

/** The base a project pins to: this origin, one published version. */
export const installBaseFor = (origin, version) => `${origin}/r/v${version}`;

/** The command that installs `items` from `base`, ready to paste. */
export function installCommand({ base, items }) {
  return `COMPONENTS_REGISTRY_URL="${base}" npx ${CLI} add ${items.join(" ")} --yes --overwrite`;
}
