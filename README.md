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
# http://ryzen:3012/r
```

**It is the host, not the pin.** The version is appended by the caller:

```bash
COMPONENTS_REGISTRY_URL="$(doppler secrets get COMPONENTS_REGISTRY_URL \
  --project common --config dev --plain)/v1.11.0" \
  npx shadcn-svelte@1.8.1 add theme --yes --overwrite
```

Two reasons, and the second is the one that bit.

1. **One copy of the version.** The pin has to live *somewhere* per consumer —
   a project's look must not change because someone published a release, so
   there is no floating "latest" (see "Registry" below, and note the endpoint
   answers `{"error":"version required"}` to an unpinned item read). If the
   secret carried the version too, there would be two copies, and the second
   one would be the one nobody checked. genproj composes the pin from its
   catalog's `themeVersion`; a hand-written command carries its own.
2. **A versioned secret makes every consumer move at once, invisibly.** The
   secret is read at install time, so changing it changes what *every* project
   installs the next time it re-runs the command — including projects that
   pinned deliberately. Host-in-the-secret means moving the estate's *address*
   is silent (an operator's business) while moving its *version* is always a
   visible edit in the thing that pins it.

The estate-wide consequence: re-pointing the registry host is one Doppler edit
and no repository sweep; releasing a new version is a `publish:release` plus a
deliberate bump wherever a project pins.

## Registry

This repo is the source of the `@nb` theme and the house blocks, and it
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

**That index is also the browse surface for an agent.** Each entry carries the
item's `title` and `description` (not just `name`/`type`/`relativeUrl`), because
the published items do — so one request answers "what exists" and "which one is
this page", on the exact base a project is already pinned to. Generated
projects' styling rules point at it as the step before writing markup
(`specs/027` in genproj), which is what makes *install a block* cheaper than
*write a layout*:

```bash
curl -s http://ryzen:3012/r/v1.10.1/index.json \
  | python3 -c 'import json,sys
for item in json.load(sys.stdin): print(item["name"], "--", item.get("description",""))'
```

Publishing is a separate, deliberate act, and it is the whole of the version story:

```bash
npm run build:theme                  # regenerate registry/theme.json from src/app.css
npm run publish:item theme 1.0.0     # freeze it as v1.0.0 and record its digest
npm run publish:release 1.10.0       # ...or freeze the whole catalogue as one version
```

Prefer `publish:release`. Because the index is projected from the frozen items,
a version that carries only the item that changed serves an index of one, and
`add theme` against it answers "Registry item 'theme' does not exist" — which
names the wrong problem and sends you looking in the theme. A release publishes
all twelve; the unchanged ones are byte-identical re-publishes that
`publish:item` reports as no-ops.

Two flags make it safe to ask before acting, because a mistaken publish is
unrecoverable — the rule above exists precisely so that it is:

```bash
npm run publish:item theme 1.13.0 -- --dry-run   # what would happen; writes nothing
npm run publish:item -- --list                   # what is published, and whether the
                                                 # working copy still matches it
```

`--dry-run` runs every check a real publish runs (name, version, immutability,
stray file) and then prints the target path and digest instead of writing. It
exits non-zero for a publish that *would* be refused, so it is a pre-flight, not
a rehearsal. `--list` answers the question nothing else answers: an item whose
working copy differs from its newest published version is either a change
waiting for a version number, or one that shipped only inside a release.

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

### Keeping a consumer on published bytes

`shadcn-svelte add` copies bytes into a repo and then forgets them. Nothing in
the consumer knows a release happened, so the only signal that a block fix
shipped used to be a human noticing a bug — which is exactly how app-shell
1.11.0 arrived (a Homepage card grew unbounded blank space, found by looking at
a dashboard, not by CI).

`scripts/check-nb-blocks.mjs` is the reference copy of a small script each
consumer repo carries at `scripts/check-nb-blocks.mjs` and runs in its own
pipeline. It reads the pin from the consumer's `.nb-registry.json` (the version,
once, in the repo whose bytes are at stake) and the base from
`COMPONENTS_REGISTRY_URL` (the host — never a pin, the same rule as genproj),
then asks two questions:

| Question | Failure means |
|---|---|
| does every vendored block still match `v<pin>`? | a block was edited locally, so the next install either loses the edit or silently reverts an upstream fix |
| is every vendored file published at `v<pin>`? | a renamed block, a local invention wearing the house name, or a pin whose index does not actually carry that block |

Formatting is not drift: comments, whitespace and prettier's trailing commas are
stripped from both sides before comparing, because a consumer's own
`prettier --write` reformats what it installs. A changed prop, class, string or
element still fails. It also prints when a newer release exists, and does **not**
fail for it — an upgrade changes a live UI and is a decision, so the pin moves in
the same PR that re-vendors.

The first run found two real forks: `stratechery-search`'s `app-shell` was two
minor versions behind (no `nav` slot) and `data-download` had hand-edited the
strip out of its shell, which is why app-shell 1.12.0 grew `footer={false}`.

Who consumes what, as of 1.15.0:

| repo | pin | takes |
|---|---|---|
| `data-download` | 1.12.0 | `app-shell`, `stat-strip`, `bar-series`, `data-table` |
| `stratechery-search` | 1.15.0 | `app-shell`, `result-list`, `filter-panel`, the rest — and its components now name roles instead of values |
| `deepseek-balance` | 1.11.0 | `app-shell`, `stat-strip` |
| `devdash` | 1.14.0 | `meter-strip`, `action-list`, `log-view` + the whole theme |
| `data-scout` | 1.14.0 | the **theme only** — it is Python-rendered static HTML, so it has no Svelte to install a block into |

`data-scout` is the case that says what a design system is: it cannot use a
component, but its stylesheet now names the same roles (`--ink`, `--line`,
`--accent`), so a palette change reaches it too. Its theme copy is manual —
`check-nb-blocks` compares vendored *components* — and its `.nb-registry.json`
records the release the copy came from.

### A block names a role, never a value — and that is a check

`var(--warn)` is a claim about what a colour is *for*; `#fdba74` is a claim about
what it *is*. The registry only works because blocks make the first kind of
claim: a consumer re-skins seven roles in one `:root` block and every installed
block follows. A literal in a block ends that — it looks installed and correct
while quietly opting itself out of every future theme change, which is the same
defect as hand-editing a block after install, one notch quieter.

So exactly one file may hold a value: the theme (`src/app.css` here; wherever the
CLI merged `cssVars` in a consumer). `scripts/check-tokens.mjs` enforces it:

```bash
npm run check:tokens                                  # this repo
node scripts/check-tokens.mjs web/src \
  --theme web/src/app.css                             # a consumer
```

Comments are stripped before scanning (a comment explaining `#0f172a, not #000`
is documentation of the rule), as is the `theme-color` meta in `app.html` —
browser chrome has no cascade to read a variable from, so that one value has to
be written down. Named colours are not caught on purpose: word-boundary matching
on prose fails no allowlist survives.

Run against the consumers, it passed `deepseek-balance`, `data-download`,
`devdash` and `data-scout` and failed `stratechery-search` on 15 literals across
six of its own hand-written components — true, and older than the registry. That
is the gate working: it found a UI that had never finished moving onto the
theme. The fix was not an exemption and not 15 local tokens: four of the
literals were roles the theme had not named (`--ink-strong`, `--accent-line`,
`--accent-line-strong`, `--bg-overlay`), so they were added upstream in 1.15.0
and the sweep followed.

### What a block looks like is measured, in two halves

A registry whose blocks can silently change appearance is a registry nobody
re-vendors. The gate is deliberately split, because the two halves fail
differently:

| Half | What it is | Can it gate? |
|---|---|---|
| `tests/visual/baseline.json` | every block's **computed** colour, type, spacing, radii and layout, per viewport | yes — computed values come from the theme's tokens, so they are the same numbers on every machine |
| `reports/screens/<block>-<viewport>.png` | one PNG per block per viewport, uploaded as a CI artifact | no — a pixel diff compares font hinting and gamma as much as design, and has to be tolerated so loosely it stops noticing |

```bash
npm run shots              # gate: computed styles must match the baseline
npm run shots:baseline     # intentional redesign: rewrite the baseline, same commit
```

Computed rather than declared, because the failure a consumer sees is usually
inheritance: a block that starts picking up `--ink-faint` from a wrapper, or
loses its radius to a utility class, has no changed line in its own file.

The `webServer` builds and runs `build/index.js`, the artifact that ships to the
container, and refuses to reuse a server already on the port — a server there is
*some other build*, and trusting it silently measures the wrong checkout.

### The blocks

`blocks/` holds the house **layouts** — the second half of the problem this
registry exists for. The theme makes a new project _look_ right; the blocks make
a page _structurally_ right without anyone re-deriving a top bar or a status
lane. The list is derived from the four UIs that already ship
(`stratechery-search`, `deepseek-balance`, `data-download`, `devdash`), not
ported from shadcn's React blocks: no project here has a sidebar, a login page or a settings
form, so those are deliberately absent.

| block            | installed as              | what it is                                                                            |
| ---------------- | ------------------------- | ------------------------------------------------------------------------------------- |
| `app-shell`      | `nb/AppShell.svelte`      | sticky blurred top bar, `mark`/`nav`/`actions`/`back` slots, `titleTag`, 68rem main, footer (`footer={false}` for none), `embedded` for a card |
| `stat-strip`     | `nb/StatStrip.svelte`     | label · big tabular value · sub-line, collapsing to one column                        |
| `result-list`    | `nb/ResultList.svelte`    | ranked rows + `row` slot, `titleTag` heading, "n more" fold                           |
| `filter-panel`   | `nb/FilterPanel.svelte`   | facets: checkbox list or one-from-N radios, optional bars and a note, `adaptFacets`   |
| `empty-state`    | `nb/EmptyState.svelte`    | cause-aware zero results (filters vs query vs error)                                  |
| `status-view`    | `nb/StatusView.svelte`    | four lanes, count in each head, pill per row                                          |
| `detail-panel`   | `nb/DetailPanel.svelte`   | header, metadata grid, prose body, `history.back()`                                   |
| `burst-timeline` | `nb/BurstTimeline.svelte` | horizontal/vertical bars, `showValues`, `caption`, audit grid                         |
| `bar-series`     | `nb/BarSeries.svelte`     | value axis in the caller's unit, per-bar display strings, a dashed projection bar     |
| `data-table`     | `nb/DataTable.svelte`     | column labels, tabular numerics, hairline rows, a `row` slot of cells                 |
| `request-form`   | `nb/RequestForm.svelte`   | schema-driven form, one message per failed constraint                                 |
| `meter-strip`    | `nb/MeterStrip.svelte`    | used-against-a-ceiling bar (`role="progressbar"`) with the reading beside it, then figures |
| `action-list`    | `nb/ActionList.svelte`    | one row per thing you *operate*: state pill, badges, and `actions`/`note`/`aside` per row |
| `log-view`       | `nb/LogView.svelte`       | a job's output in a panel: state pill, notice, self-scrolling `pre` (bindable), actions |

```bash
npm run build:blocks            # blocks/*/*.svelte -> registry/<name>.json -> registry.json
npm run publish:item data-table 1.8.0
```

Browse them at **`/`** — the landing page imports the same files the registry
publishes and renders every one of them, so a block that does not render breaks
the build. Neither the page nor its tests count them: they read `registry.json`,
because a literal "eleven" is how this list went stale twice. (`/blocks` was a second page for this; it now 308s to `/`, because
asking someone to press a button to reach the only content was a wasted tap —
and on an iPhone home screen the button sat under the status bar.)

**Two rules, both enforced by `tests/blocks.test.js`:** no block hardcodes a
colour (a translucent tint is `color-mix(in srgb, var(--bg) 88%, transparent)`,
derived from the token so a palette change moves the blocks with it), and the
served item's `content` is byte-identical to the source file.

### What 1.15.0 added: the ink, accent and ground roles the theme was already using

`stratechery-search` is where this theme came from and the last consumer still on
`1.11.0`. Re-pinning it turned up a dozen colour literals in its components that
were not one-offs: every one of them was a *role the theme was already
spelling out in its own rules but had not named*. So they are named, and the
theme's own rules use them too.

| literal | sites | role |
| --- | --- | --- |
| `#fff`, `#f1f5f9` | 11 — hover ink, the active nav item, a page `h1` | `--ink-strong` |
| `rgba(125, 211, 252, 0.4 \| 0.45)` | 5 — the border of a hovered or primary control | `--accent-line` |
| `rgba(125, 211, 252, 0.55)` | 1 — the border of a *selected* one | `--accent-line-strong` |
| `rgba(125, 211, 252, 0.1)` | 1 — the fill behind a selected chip | `--accent-soft` (0.14) |
| `rgba(15, 23, 42, 0.93)` | 1 — a sticky row that scrolls over the page | `--bg-overlay` |

Two of these are judgement calls, recorded so they can be argued with:
`--accent-soft` already existed at 0.14 and a second 0.1 tint would be a
distinction no screen makes; and hover/selected collapse three accent
opacities into two, because "under the pointer" and "this is the one you
picked" are the only two states a consumer was actually drawing.

The theme's own `.seg button.on`, `.btn:hover` and `.btn.primary` borders now
name these roles, so the literals are gone from the theme as well — one file
still holds values, and that file is the one that is *made* of values.

While in here: the landing page and the MCP `initialize` instructions both said
"eleven blocks" while the catalogue served fourteen. Both now count
`registry.json`. Fourteen is not the interesting number; that the text could
drift from the catalogue was.

### What 1.14.0 added: `--tap`, because 34px is the wrong height on a phone

`action-list` and `log-view` hardcoded `min-height: 34px` on their controls.
That is a reasonable desktop size and the wrong one on a thumb: 44px is the
smallest target a finger reliably hits (Apple HIG, WCAG 2.5.5), and `devdash`
— the app these blocks were lifted from — was careful about exactly that
before it adopted them.

The fix is a role, not a second block: the theme now carries `--tap: 2rem`, the
blocks size their controls with `var(--tap)`, and a phone-first consumer raises
it in its own theme (`devdash` sets `2.75rem`). `data-scout` had already
invented this name in its own stylesheet, which is how a third occurrence
becomes a role.

### What 1.13.0 added: three blocks devdash had been writing inline

Migrating `devdash` onto the system is what produced these, and each one is a
pattern that recurred in a third place rather than an invention:

- `meter-strip` — a ratio against a ceiling. `stat-strip` states figures; here
  the bar *is* the fact, so it is a `role="progressbar"` with the reading beside
  it (clamped to 0–100, and 0 when the ceiling is 0 rather than a NaN width).
- `action-list` — one row per thing you *operate*, as against `result-list`,
  which is something you read and rank. Per-row slots for the actions, a note
  and an aside, because which action is valid is the row's business.
- `log-view` — a job's output. The one place a `pre` is right, with the pane
  bindable so the caller can follow its tail without the block guessing.

The gallery's footer, the visual gate and the tests stopped counting blocks.
Five places asserted a literal 11 or 12, which is how genproj's copy of
`NB_BLOCKS` went stale; they now derive the list from `registry.json`.

### What 1.12.0 added: a page may end where its content ends

`app-shell`'s `footer` now has three states instead of two. Omitted is the house
strip on a page and nothing in a card; a snippet is the caller's own strip;
`false` is no footer at all, on a page.

The third state exists because `data-download` wanted it and, finding no way to
say it, **edited the block after installing it** — deleting the default footer
from its vendored copy and asserting the absence in its own tests. `embedded`
was the only lever, and it was the wrong one: a card's rules (no
`min-height: 100dvh`) applied to a page that needs them. That fork was invisible
for three releases; the consumer drift check found it in its first run.

Two things follow, and both are the point of the exercise rather than a
side-effect. A block edited in place is a block the next `add --overwrite`
silently reverts — so the fix belongs upstream, in a release. And a system whose
answer to "not this one thing" is "fork it" gets forked, quietly, everywhere.

### What 1.11.0 added: a card is not a viewport

`deepseek-balance` renders as a Homepage dashboard card — an iframe whose parent
resizes the card to fit. Its reporter posts `document.body.offsetHeight` every
1500ms, which is Homepage's `homepage-iframe-resize` contract. After adopting
`app-shell` the card grew unbounded blank space below its content, and the
reason was the shell, not the widget: `.shell { min-height: 100dvh }` makes
`<body>` at least as tall as the *iframe*, so the reporter measured the frame it
was already given instead of what it contained. Every poll could therefore only
ever ask for a taller frame — a feedback loop with no fixed point.

`embedded` says "this shell is not a page". It drops the viewport min-height
(`.shell.embedded { min-height: 0 }`) so the shell is exactly as tall as its
content, and it drops the default house footer, because a card has no room for
chrome and the parent owns the surroundings. An explicit `footer` snippet still
renders — then the consumer asked for it. Defaults are untouched: a normal page
still fills the viewport and still ends in the footer strip.

The rule: **a component that can be embedded must not assume it owns the
viewport.** `min-height: 100dvh` is a statement about the window; in an iframe
the window belongs to someone else, and any self-measuring contract around it
turns that statement into a growth loop.

### What 1.10.1 fixed: a sticky bar may not spend the inset as an offset

1.10.0 shipped with `position: sticky; top: var(--safe-top)`, and on a notched
iPhone the page's own title vanished behind the bar. Not a near miss: with a
47px inset the bar painted 47–102, `.lede` occupied 79–101, and
`elementFromPoint` at the title's centre returned `.topbar-inner`.

The rule this cost: **a sticky element with a nonzero `top` is painted offset
while its flow box stays put, so every pixel of that offset is a pixel of
content it covers.** A safe-area inset belongs in the bar's own `padding-top` —
then the box grows, the flow moves with it, and the bar's background (rather
than a bare strip of body colour) covers the status-bar band. `.shell` also
takes `min-height: 100dvh` after the `100vh`, because `100vh` is taller than the
visible area while an iOS toolbar is showing.

It is testable without a device: Chromium's `env(safe-area-inset-top)` is always
0, so `tests/block-gaps.test.js` asserts the declaration (`top: 0` with
`padding-top: var(--safe-top)`, and no offset form), and the consumer's
Playwright suite sets `--safe-top: 47px` on the document element and asserts the
title starts at or below the bar's bottom.

### What 1.10.0 added, and why

Two fixes, both found by looking at the ported `data-download` on a phone.

**`app-shell` grew `nav`.** The port had put its other view in the `actions`
slot as `<a class="pill">Plan types</a>` — and a pill is what a *state* looks
like in this system. On a 390px screen the only hint that a second screen
existed sat next to the title in the same shape as a status badge, so "what
views are there?" had no answer. Navigation is the bar's job and it has one
shape, so the block owns it: `nav={[{ label, href, current }]}` renders a tab
row with `aria-current="page"`, the active tab tinted with `--accent-soft`,
and the micro subtitle dropped below 520px — the subtitle repeats what the
highlighted tab already says, and it was the thing pushing the second tab out
of reach. The bar came out *shorter* (61px → 55px) with more in it.

**The theme grew the page intro.** `.lede` and `.sub-lede` are names a page
reaches for by instinct; the theme did not define them, so `data-download`'s
intro rendered at body size in full ink, indistinguishable from the paragraph
under it. Two rules, plus `.notice.accent`, `.notice code`, `.quiet` and
`.muted`, which the old bespoke sheet had defined and the port had silently
lost. A class a consumer writes and the theme ignores is worse than a missing
feature: it looks like it worked.

### What 1.9.0 added, and why

`bar-series` is the first block that is a *chart*, and it exists because
`burst-timeline` is a sparkline: percentage heights, no axis, a `count`. That is
right for "recent bursts" and wrong for three daily charts that each have to say
how much — spend in CNY, usage time in minutes, cost per hour in fen. Converting
`deepseek-balance` needed the second animal, and the difference is all in the
claims a chart makes:

| added                 | why the sparkline could not carry it                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| a computed y-axis     | ticks land on multiples of a nice step, so a maximum of 135 minutes labels 0/50/100/150 rather than 37.5 / 75 / 112.5                                                   |
| `axisFormat`          | the API emits numbers and the reader wants `2h 15m`; a block that insists on plain numbers pushes that conversion into every consumer, which is how three copies start   |
| `bar.display`         | geometry is the block's business (`bar.value` sets the height); the string is the consumer's, because only it knows the currency                                       |
| `bar.projected`       | today's spend so far, extended to a full day, is a different claim from a measured bar — it is drawn hollow and dashed, never solid                                      |
| a `null` value keeps its slot | "we held no snapshots" is a fact about the day; dropping the bar would silently close the gap in the axis                                                       |

The general rule this one taught: **a block earns its place when a second
consumer needs the same geometry but its own words.** `burst-timeline` and
`bar-series` draw the same rectangles; one labels a count of intervals, the
other labels a currency, a duration and a rate — and neither is a copy of the
other's markup.

### What 1.8.0 added, and why

One new block, and it is the first one found by a screen that is _not_ Svelte.
Converting `data-download` (FastAPI + Jinja, no build step) started with a
question — what does this screen need that a ranked list cannot give — and the
answer was a table: the request book is six columns, two of them numbers that
have to line up, and the plan-type page is a parameter schema. One block covers
both, because the difference between them is what is _in_ a cell:

| added                                 | why it needs a block of its own                                                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `columns` (`label`, `width`, `align`) | `result-list` ranks rows and stacks a title over meta; a table's first job is that `$0.0412` sits under `$0.0412` and an id cannot push it out of line                                 |
| `row(item, index)` returning cells    | the two screens differ entirely inside a cell — a state pill with a tooltip versus an enum, a type and a constraint list — so the block owns the shell and the consumer owns the cells |
| `.num` / `.wrap` cell modifiers       | right-aligned tabular figures, and the one cell that is prose in a row of one-liners                                                                                                   |
| the header disappears under 600px     | six columns at 390px is a scrollbar or a truncated id; a record wraps instead, and the labels were never worth the vertical space there                                                |

The lesson from the _caller_ side is the one worth keeping: a Python app with no
frontend build cannot install a Svelte block, so the honest first step is to
write down what its screens need — and that list is block requirements.

Then `data-download` went the whole way, and is now the first consumer of this
registry that is **not** Svelte-native: `web/` is Vite + Svelte 5 building static
files, FastAPI serves them, and every block it needs is installed by version
as a SvelteKit app would install them. What that proved is the boundary is
per-consumer, not per-framework: the app kept its store, its four `v_*` views,
its token scopes and its `/v1/*` API, and gave up only the markup. A registry
item is a file plus a stylesheet — it does not need the consumer to be an SPA,
only to have a build step.

### What 1.7.0 added, and why

The last thing keeping a real app off the blocks. `filter-panel` could only offer
"any number of these", which is the shape of a tag filter and the wrong shape of
a **range** — a year picker is one choice from N, drawn as a histogram so you can
see which years have anything in them:

| added            | why a facet needs it                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mode: "single"` | one choice from N renders as radios sharing `nb-facet-<key>`, selecting replaces rather than appends, and clicking the active one clears the facet (how you get back to "any year")  |
| `layout: "bars"` | the count was a number at the end of a row; as a bar behind the row it becomes a histogram, scaled to the largest count in _that_ facet, so `26` next to `12` reads as twice as tall |
| `note`           | one line under the group ("one run, or all of them"): the place for the caveat a facet owes its reader, where `label` is too short to carry it                                       |

All three are per-facet fields with defaults (`"multiple"`, `"list"`, no note),
so an install of the canonical tag filter is unchanged — see
`tests/block-gaps.test.js`, which pins both the new path and the old default.

### What 1.6.1 fixed

Two CSS defects in the bar, found by putting a real app in the shell at 390px
wide:

| what                                       | why it mattered                                                                                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the wordmark wrapped                       | "Stratechery Search" broke over two lines, so the sticky bar was 82px tall on the screen where height is dearest. It is a wordmark: one line, `text-overflow: ellipsis` |
| the tail of the bar did not hold its width | `.bar-end` shrank with the brand, so the `actions` nav wrapped into a second row instead of the titles giving way                                                       |

Both are inside the block, so no consumer had to learn them twice.

### What 1.6.0 added, and why

One prop, found the same way as the rest — by trying to use the block:

| block       | prop                        | the gap it closes                                                                                                                                                                                                                                                               |
| ----------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app-shell` | `titleTag` (default `"h1"`) | the wordmark is an `h1`, which is right when the bar carries the page's title (a dashboard) and wrong in a reader or a gallery, where the content owns the `h1` and the bar carries the product's name. The alternative was either two `h1`s or renaming the one in the content |

### What 1.5.0 added, and why

Two interaction-model gaps — the kind `adaptFacets` and `row` cannot close,
because they are about _behaviour_ rather than about the shape of a payload:

| block            | prop              | the gap it closes                                                                                                                                                                                                       |
| ---------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app-shell`      | `back` snippet    | the back pill is a **link**. An app whose back is `history.back()` — so it returns to the results page you left, querystring and all — had to keep its own header, because a link pushes a new entry instead of popping |
| `burst-timeline` | `showValues`      | the per-bucket count lived only in a `title` tooltip, so a bar **table** ("articles per year", with the numbers visible) could not use the block                                                                        |
| `burst-timeline` | `caption` snippet | the caveat a chart owes its reader ("daily updates reach this archive from March 2018, so the early bars are the weekly and free articles") is a sentence, and `chartLabel` is a 10px uppercase micro label             |

`showValues` also made the horizontal layout a grid rather than a reversed flex
row, so label, bar and number line up in columns down the list.

### What 1.4.0 added, and why

Four gaps that converting `stratechery-search` onto the blocks found. Each is an
additive prop with a default that keeps 1.3.0 behaviour, so an existing install
neither breaks nor changes output:

| block            | prop                         | the gap it closes                                                                                                             |
| ---------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `app-shell`      | `mark`, `actions`            | no place for a logo or primary nav; `status` was the only right-hand slot                                                     |
| `result-list`    | `row(item, index)`           | a row could carry four strings, so highlighted passages and a per-passage fold could not move in                              |
| `result-list`    | `titleTag` (default `"div"`) | the title was not a heading, so the section vanished from the outline and a page had to render its own `h2` and pass no title |
| `filter-panel`   | `adaptFacets`                | only one facet shape was accepted; an API's `by_*` maps had to be reshaped by every caller, on every render                   |
| `burst-timeline` | `orientation`, `chartLabel`  | vertical-only, and "recent bursts" was hard-coded over intervals that were not bursts                                         |

The theme also gained four safe-area variables (`--safe-top` and friends, from
`env(safe-area-inset-*)`) at 1.4.0. `app-shell` spends them on its sticky bar,
main column and footer, and the registry's own page spends them on its header —
which is what stops an app launched from a home screen from drawing its header
under the status bar.

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

## Ask the registry (MCP)

`POST /mcp` is the registry as a Model Context Protocol server, so an agent can
ask what exists instead of being told in prose. Until it existed, "browse the
registry" was a `curl` recipe inside the styling rules a generated project
carries — a sentence an agent had to read, understand and then get right by
hand, for the one step in adopting the design system that had no interface
(`shadcn-svelte@1.8.1` ships no MCP server and no `registry list`).

| Tool | Answers |
|---|---|
| `browse_registry` | what is published at a version: name, title, type, description, files |
| `search_registry` | which of them is my problem — matched against name, title and description |
| `get_item` | the item's JSON *including file contents*, so a block is read rather than installed blind |
| `install_command` | the one line that installs it, spelled correctly |

`install_command` is a tool rather than documentation because it is the thing
that gets got wrong: the pin belongs in the base — `/r/v1.12.0` — never in a
query, because the CLI appends only `index.json` and `<name>.json` and a query
cannot travel through that. An agent that assembles the URL itself is an agent
that will assemble it differently next time.

It is JSON-RPC over `POST`, request/response only: no SSE, no session. Every
call is a read of files that never change, so there is nothing to resume, and a
`GET` says what the endpoint is instead of opening a stream that never speaks.
The server is hand-rolled (four read-only tools did not justify the SDK in the
container) and `tests/mcp.test.js` connects to it with the **official** client —
protocol compliance is measured, not asserted. That lesson is already in this
repo: the `/r` route's `index.json` array was discovered by running the real CLI
after an assumed shape cost a round trip.

```bash
curl -s localhost:3000/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Installable on a phone

The app carries a real home-screen icon, not a bare `favicon.png`:

| file                                  | why                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| `static/icon.svg`                     | the source; four house-coloured pieces on the slate ground, one of them only an outline |
| `static/apple-touch-icon.png` (180)   | **iOS ignores `manifest.webmanifest` icons** — this link is the whole home-screen icon  |
| `static/icon-192.png`, `icon-512.png` | Android / PWA install prompt                                                            |
| `static/favicon.png` (32)             | the tab                                                                                 |
| `static/manifest.webmanifest`         | `display: standalone`, `theme_color` `#0f172a`                                          |

`src/app.html` links all of them, plus `apple-mobile-web-app-*` so the launch
screen and status bar stay dark instead of flashing white. The icon is full
bleed with no rounded corners of its own: iOS rounds it, and an inset icon shows
up as a ring against a dark wallpaper. `tests/icon.test.js` asserts every size
exists and that the SVG still carries the canonical token values.

The mark is four pieces — sky, cream, green, and one that is only an outline —
because a registry is a set of parts, some taken and some not. The first attempt
was the word `nb` in accent on slate with one cream rule under it; at home-screen
size that reads as a dark blue tile with a line, which is a colour, not a mark.
The composition is inside the maskable safe zone (76px of 512 = 15%), so a
launcher that crops to a circle keeps all four pieces.

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
