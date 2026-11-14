# ui-registry

A ui-registry project generated with genproj

## Capabilities

This project includes the following capabilities:

- **Doppler Secrets Management**: Integrates Doppler for secure secrets management. Enables the various MCP servers that rely on privileged tokens to access their services (e.g. Buildkite, GitHub, SonarQube).
- **AI Coding Agents**: Sets up the AI coding agents in the devcontainer: goose (config, MCP servers and spec-first recipes) plus the Antigravity CLI.
- **Container Agent**: Every generated devcontainer brings up and registers its own a2a-goose agent (`<repo>-dev`), reached over the tailnet by the LiteLLM proxy; reuses the a2a-goose GitHub release channel, so the container has the same self-update path as a host.
- **Secret Scanning (gitleaks)**: Required on every project: gitleaks scans staged changes in a pre-commit hook and the full history in CI. Free, offline, no account and no quota.
- **Docker**: Adds Docker support for containerised builds and tooling.
- **Node.js DevContainer**: Sets up a VS Code DevContainer with Node.js environment.
- **SvelteKit**: Initializes a SvelteKit project with Svelte 5.
- **Docker Container**: Containerize the project and publish to the GitHub Container Registry (GHCR) for deployment to a NAS or self-hosted host via Docker Compose. Mutually exclusive with other deployment systems. Set `workload: batch` for a scheduled job image (runs and exits; no port, no healthcheck, no Watchtower) instead of a long-running service.
- **Buildkite Integration**: Runs CI on a self-hosted Buildkite agent (Apple silicon) instead of a metered cloud fleet. The pipeline and its GitHub webhook are created during generation, so there is no manual "set up project" step. It can coexist with an existing CI provider, so a repository can migrate without a flag day.
- **Playwright**: Configures Playwright for end-to-end testing.

## Setup

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Run the dev server:

   ```bash
   npm run dev
   ```

## Secret scanning

Every commit is scanned for credentials by `gitleaks`, and CI scans the
**full history**. The local hook is convenience; CI is the gate you cannot skip
with `git commit --no-verify`.

```bash
scripts/setup-git-hooks.sh   # installs gitleaks and sets core.hooksPath
```

If a commit is blocked, **rotate the credential first** — a finding means it may
already be exposed. Then remove it from the staged changes and commit again.

Only for a verified false positive, add its fingerprint to `.gitleaksignore`,
which is a committed and reviewable diff. Never bypass the hook with
`--no-verify`: it leaves no record and the next commit is unscanned too.

This is detection, not storage (Doppler holds secrets) and not rotation (that is
a human step). Allowlist edits in `.gitleaks.toml` are reviewable changes on
purpose.

## Doppler

This project uses Doppler for secrets from the shared `common` project
(config `dev`) — no per-repo Doppler project is created. First use (links
the shared project and `dev` config):

```bash
doppler setup --project common --config dev
```

If your repo needs app-specific secrets that shouldn't live in the shared
`common` project, regenerate it with the doppler capability set to
`projectStrategy: "new"` to get a dedicated project.

The Doppler CLI is installed in the devcontainer — it must be on PATH for the
VS Code extension and `doppler run` to work. Auth is persisted via the host
`~/.doppler` bind-mount.

### Env-var precedence (read this if `doppler run` hits the wrong project)

Doppler resolves its target as **environment variables > `doppler.yaml` >
`~/.doppler` scoped config**. If your shell — or the session that launched
the devcontainer (e.g. an agent runtime) — exports `DOPPLER_PROJECT` /
`DOPPLER_CONFIG` / `DOPPLER_ENVIRONMENT`, those silently override this
repo's `doppler.yaml` and every `doppler` command targets the wrong
project. The devcontainer's post-create setup pins this repo's context
(`common`/`dev`) in `~/.bashrc` and `~/.zshrc` and warns at
setup if resolution still mismatches. To force the correct context manually:

```bash
unset DOPPLER_PROJECT DOPPLER_CONFIG DOPPLER_ENVIRONMENT
doppler setup --no-interactive --project common --config dev
```

### Where the registry URL lives

`COMPONENTS_REGISTRY_URL` is **not** committed to any project. It is a Doppler
secret in `common`, identical in `dev`, `stg` and `prd`:

```bash
doppler secrets get COMPONENTS_REGISTRY_URL --project common --config dev --plain
# http://ryzen:3012/r/v1.2.0
```

Consumers and generators read it at run time (`doppler run -- npx shadcn-svelte
add theme ...`), so re-pointing every consumer at a new published version is one
Doppler edit and not a sweep of repositories. The value names the version on
purpose — see "Registry" below: a floating "latest" URL would make an install
depend on the day it ran.

## Registry

This repo is the source of the `@nb` theme and the nine house blocks, and it
serves them over HTTP. There is no static `registry/` directory exposed to
the network: `src/routes/r/[...path]/+server.js` reads the JSON from disk because
it has to resolve a version against a manifest and verify a digest, which a
static file cannot do.

```bash
GET /r/registry.json                        # the index (GET /r is the same document)
GET /r/theme.json?version=1.0.0             # one item, CSS inlined
```

**The endpoint is public, deliberately (2026-11-14).** There is no bearer token
and no `401`. `shadcn-svelte@1.8.1` sends no auth headers at all — verified by
reading its published bundle: no `Authorization`, no `registries` map, no
namespaces — so a gated registry cannot be consumed by the only CLI that would
consume it. The token was designed on an assumption that did not hold, and a gate
no client can pass protects nothing but the illusion of one.

That costs nothing here, because the gate was never what kept anything private:
the repo is public and the served items are committed to it. What protects this
endpoint is **immutability** — items are version-addressed and checked against a
digest on every read — and that works identically for an authenticated caller and
an anonymous one.

### Versions are immutable, and items are only served at one

A design system that mutates under a live project is worse than a stale one, so
`?version=` is **required** for an item and there is no "latest":

| Request                          | Result                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/r/registry.json`               | `200`, always current — the index is a catalogue, not an artifact. Its `x-registry-versions` header lists what is published. |
| `/r/theme.json` (no version)     | `400`, body names the available versions                                                                                     |
| `/r/theme.json?version=9.9.9`    | `404` — never a fall-back to whatever is on disk                                                                             |
| `/r/theme.json?version=1.0.0`    | `200`, `x-registry-version` and a strong `etag` (the sha256)                                                                 |
| `/r/v1.2.0/index.json`           | `200`, the index **projected from** the frozen items of that version — an array of `{name, type, relativeUrl}`               |
| `/r/v1.2.0/theme.json`           | `200`, the frozen item itself — what `shadcn-svelte` fetches from `relativeUrl`                                              |
| a published file edited in place | `500` — the route verifies every read against the manifest digest                                                            |

The `v<version>/` prefix is what a client actually reads; `?version=` is for
humans and `curl`. Both resolve the same frozen bytes. The per-version index is
**derived at request time** rather than stored: an index written from today's
catalogue would describe an old version with a target it never shipped, whereas
projecting it from the digest-checked items cannot drift.

Publishing is a separate, deliberate act, and it is the whole of the version story:

```bash
npm run build:theme               # regenerate registry/theme.json from src/app.css
npm run publish:item theme 1.0.0  # freeze it as v1.0.0 and record its digest
```

That writes `registry/versions/v1.0.0/theme.json` and appends `{name, version,
sha256, bytes, publishedAt}` to `registry/versions/manifest.json`. Re-publishing
the same version with different bytes is **refused** — to change a published item
you publish the next version. `tests/registry.test.js` and
`tests/publish-item.test.js` pin both halves of that rule (the serve-time digest
check and the publish-time refusal), so neither can quietly become a convention.

**How a Svelte consumer installs it** — exactly two things, no `components.json`
registry block:

```bash
COMPONENTS_REGISTRY_URL=https://<host>/r/v1.2.0 \
  npx shadcn-svelte@1.8.1 add theme --yes --overwrite
```

- **`v1.2.0` is in the URL, not a query parameter.** `shadcn-svelte@1.8.1` uses
  `COMPONENTS_REGISTRY_URL` **verbatim** — it does not append
  `/styles/<style>/` to it (only the `REGISTRY_URL` / `components.json`
  fallback path does) — then fetches `<base>/index.json` and every
  `relativeUrl` it names. So the base must already be a version.
- **`--overwrite` is required, and `--yes` is not enough.** `add` asks a second
  question — _"Updates to your src/app.css are required. Existing CSS variables
  may be overwritten. Continue?"_ — that `--yes` does not answer. Non-interactive
  (closed stdin) it prints that prompt and **exits 0 having written nothing**,
  which reads as success; with an open stdin it waits forever. Only
  `--overwrite` answers it. `scripts/cli-contract.js` pins both halves so this
  cannot silently change.
- **Pin ≥ 1.2.0.** `1.0.0` (`files[].target: src/app.css`) and `1.1.0`
  (`files[].target: src/nb-theme.css`) are the two rejected shapes: for a
  `registry:theme` item the CLI resolves `files[].target` against
  `basename(tailwind.css)` **used as a directory**, so `1.1.0` wrote
  `<project>/app.css/src/nb-theme.css` — a directory named `app.css` — while
  printing "theme installed at src/app.css". They are frozen and still served
  because published versions are immutable; do not install them.

The `registries`/`params` block above is shadcn/ui (React) syntax:
`shadcn-svelte@1.8.1` has no `registries` map, no `headers`, and no
query-parameter pinning. That is why the version lives in the URL.

### The theme

`src/app.css` **is** the theme, and it is the single source of truth. It was
lifted **verbatim** from `nickbrett1/stratechery-search`
`web/src/lib/theme.css` at commit `42d3ab6` (fetched 2026-11-14,
sha256 `bb012ad9…0862`) — not retyped and not retuned, because the problem this
registry exists to solve is a token sheet hand-copied between repos with no
version and no authority.

`registry/theme.json` is the _working_ item — the shape that is served — so it is
generated rather than hand-edited:

```bash
npm run build:theme
```

It is a `registry:theme` item with **no `files`**: the theme installs as
`cssVars.theme` (28 custom properties) plus a `css` object (39 rule blocks, one
level of at-rule nesting), and the CLI merges both into the consumer's own
stylesheet with PostCSS, leaving its `@import "tailwindcss";` in place. The
rejected alternative was `registry:file` with `target: src/nb-theme.css` — a
second stylesheet that the CLI's path resolution could not place correctly and
that the consumer would then have to import by hand. `css` must be an **object**
(`{selector: {property: value}}`), not a CSS string: a string fails the schema
with `Invalid input at ["css"]`.

`tests/registry.test.js` fails if the generated item and `src/app.css` disagree.

### These claims are executable, not remembered

Every fact in the two sections above was wrong at least once, and every wrong
version came from _reading_ the CLI's bundle or docs rather than _running_ it —
six wrong claims, six passing unit tests, one broken consumer. So the beliefs are
now executable:

```bash
npm run test:cli    # rebuilds build/, starts it in the production layout, runs the pinned CLI
```

`scripts/cli-contract.js` copies `build/`, `registry/` and `registry.json` into an
empty directory, starts the adapter-node server there (the layout the container
runs), creates a throwaway SvelteKit-shaped consumer (`components.json`,
`src/app.css` = one `@import "tailwindcss";`), and runs `shadcn-svelte@1.8.1 add
theme` against it. It asserts the index is a JSON **array**, that `--yes` alone
installs nothing while `--overwrite` does, that every `cssVars` entry and every
`css` selector from the _served, frozen item_ lands in the consumer's stylesheet
with its value, that the consumer keeps its own import, and that no
`nb-theme.css` and no directory named `*.css` appears. Expectations are derived
from the item, not hardcoded, so a new published version cannot slip past it.
It runs as its own Buildkite step (`cli_contract`) because it needs the network
once to fetch the pinned CLI.

There is one consumer-side consequence worth knowing: the merge also injects
`@import "shadcn-svelte/tailwind.css";`, so `shadcn-svelte` has to be a
dependency of the project at build time.

### The nine blocks

`blocks/` holds the house **layouts** — the second half of the problem this
registry exists for. The theme makes a new project _look_ right; the blocks make
a page _structurally_ right without anyone re-deriving a top bar or a status
lane. The list is derived from the three UIs that already ship
(`stratechery-search`, `deepseek-balance`, `data-download`), not ported from
shadcn's React blocks: no project here has a sidebar, a login page or a settings
form, so those are deliberately absent.

| block            | installed as              | what it is                                                      |
| ---------------- | ------------------------- | --------------------------------------------------------------- |
| `app-shell`      | `nb/AppShell.svelte`      | sticky blurred top bar, wordmark, back pill, 68rem main, footer |
| `stat-strip`     | `nb/StatStrip.svelte`     | label · big tabular value · sub-line, collapsing to one column  |
| `result-list`    | `nb/ResultList.svelte`    | ranked rows with pill + snippet and a "n more" fold             |
| `filter-panel`   | `nb/FilterPanel.svelte`   | facet card on desktop; chip row + bottom sheet under 600px      |
| `empty-state`    | `nb/EmptyState.svelte`    | cause-aware zero results (filters vs query vs error)            |
| `status-view`    | `nb/StatusView.svelte`    | four lanes, count in each head, pill per row                    |
| `detail-panel`   | `nb/DetailPanel.svelte`   | header, metadata grid, prose body, `history.back()`             |
| `burst-timeline` | `nb/BurstTimeline.svelte` | interval chart + audit grid with an "Explains" column           |
| `request-form`   | `nb/RequestForm.svelte`   | schema-driven form, one message per failed constraint           |

```bash
npm run build:blocks            # blocks/*/*.svelte -> registry/<name>.json -> registry.json
npm run publish:item app-shell 1.3.0
```

Browse them at **`/blocks`** — the gallery imports the same nine files the
registry publishes, so a block that does not render breaks the build.

**Two rules, both enforced by `tests/blocks.test.js`:** no block hardcodes a
colour (a translucent tint is `color-mix(in srgb, var(--bg) 88%, transparent)`,
derived from the token so a palette change moves the blocks with it), and the
served item's `content` is byte-identical to the source file.

**Install targets are relative to the components alias, not the project root.**
That is measured, not assumed: a target of `src/lib/components/nb/AppShell.svelte`
installed itself at `src/lib/components/src/lib/components/nb/AppShell.svelte`,
because the CLI prepends `aliases.components`. The published target is
`nb/AppShell.svelte`, and `scripts/cli-contract.js` runs `add app-shell` against
the production build and asserts where the file lands, that it is byte-for-byte
the published content, and that it compiles in the consumer.

### Schemas

`schema/` holds the shadcn-svelte registry schemas as vendored copies; see
`schema/README.md` for the source URLs, the fetch date, and the difference
between the index's file shape (`path`) and a served item's (`content`+`target`).
`tests/registry-schema.test.js` validates both documents against them.

## Installable on a phone

The app carries a real home-screen icon, not a bare `favicon.png`:

| file                                  | why                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `static/icon.svg`                     | the source; slate ground, accent monogram, one cream rule                              |
| `static/apple-touch-icon.png` (180)   | **iOS ignores `manifest.webmanifest` icons** — this link is the whole home-screen icon |
| `static/icon-192.png`, `icon-512.png` | Android / PWA install prompt                                                           |
| `static/favicon.png` (32)             | the tab                                                                                |
| `static/manifest.webmanifest`         | `display: standalone`, `theme_color` `#0f172a`                                         |

`src/app.html` links all of them, plus `apple-mobile-web-app-*` so the launch
screen and status bar stay dark instead of flashing white. The icon is full
bleed with no rounded corners of its own: iOS rounds it, and an inset icon shows
up as a ring against a dark wallpaper. `tests/icon.test.js` asserts every size
exists and that the SVG still carries the three canonical token values.

**To add it:** open `http://<host>:3012/` in Safari on the phone → Share → Add to
Home Screen. It launches standalone, titled "nb UI".

## Deployment

See `deploy/README.md` for the deployment runbook (Buildkite -> GHCR ->
Watchtower -> Docker host). Deploy with:

```bash
docker compose up -d
```

## The container's agent

This devcontainer brings up its own `a2a-goose` agent, registered in the hub as
`ui-registry-dev` - one agent per repo, so a restart reclaims the same entry
instead of adding a second one. Turns are billed through the LiteLLM proxy
configured in Doppler (`LITELLM_BASE_URL`).

```bash
scripts/agent-dev.sh start    # write secrets + config, fetch the launcher, run it
scripts/agent-dev.sh status   # running or not, the card URL, the log tail
scripts/agent-dev.sh stop     # SIGTERM, wait for a clean deregister, confirm gone
```

`start` runs from the devcontainer's post-start hook, so the agent is normally
already up when you arrive. It fails open: with no network on a first start it
prints why it did not start and leaves the project usable. Secrets come from
Doppler into `~/.config/a2a-goose/env` (mode 0600) and never into the image or
`containerEnv`.

## Generated by genproj

This project was generated using the genproj tool.
