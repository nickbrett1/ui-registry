<script>
  /**
   * The registry, and the blocks themselves, on one page.
   *
   * There is no separate gallery: the blocks are the reason to visit, so they
   * are the page. A link to a second page was a link a phone user could not see
   * (the header sat under the status bar) and had to press to reach the only
   * content that mattered.
   *
   * The ten blocks are imported from `blocks/` -- the same bytes
   * `registry.json` publishes, not a copy. If a block stops rendering, this page
   * stops building, which is the cheapest possible check that ten published
   * items are ten working components.
   */
  import published from "../../registry/versions/manifest.json";

  import AppShell from "../../blocks/app-shell/AppShell.svelte";
  import StatStrip from "../../blocks/stat-strip/StatStrip.svelte";
  import ResultList from "../../blocks/result-list/ResultList.svelte";
  import FilterPanel from "../../blocks/filter-panel/FilterPanel.svelte";
  import EmptyState from "../../blocks/empty-state/EmptyState.svelte";
  import StatusView from "../../blocks/status-view/StatusView.svelte";
  import DetailPanel from "../../blocks/detail-panel/DetailPanel.svelte";
  import BurstTimeline from "../../blocks/burst-timeline/BurstTimeline.svelte";
  import DataTable from "../../blocks/data-table/DataTable.svelte";
  import RequestForm from "../../blocks/request-form/RequestForm.svelte";

  // The version is *read*, not written down: importing the published manifest
  // means the page cannot advertise a version the registry does not serve, which
  // is the one thing a registry page must not get wrong.
  const versions = [...new Set(published.items.map((item) => item.version))];
  const latest = versions.sort((a, b) => {
    const [x, y] = [a.split(".").map(Number), b.split(".").map(Number)];
    for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  })[versions.length - 1];
  const manifest = { version: latest };

  // What each token is *for*, in the words a consumer would use. A swatch with
  // no label is decoration; a swatch labelled "--warn -- waiting or pending" is
  // the reason a block can be re-skinned without being read.
  const palette = [
    { token: "bg", means: "the ground; every surface is a tint of it" },
    { token: "ink", means: "body text" },
    { token: "accent", means: "links, the active tab, anything you can press" },
    { token: "ok", means: "succeeded, matched, done" },
    { token: "warn", means: "waiting, pending, slow" },
    { token: "bad", means: "failed, blocked" },
    { token: "mark", means: "the matched words inside a snippet" },
  ];

  const blocks = [
    { name: "app-shell", note: "sticky bar with a mark, a nav slot and your own back control" },
    { name: "stat-strip", note: "label · big tabular value · sub-line" },
    { name: "result-list", note: "ranked rows, an h3 title, a fold, a row slot" },
    { name: "filter-panel", note: "facets on desktop; a facet adapter for the API's own shape" },
    { name: "empty-state", note: "cause-aware zero results" },
    { name: "status-view", note: "four lanes, counts in the head" },
    { name: "detail-panel", note: "header, metadata grid, prose" },
    { name: "burst-timeline", note: "horizontal or vertical bars, values, a caption you set" },
    { name: "data-table", note: "column-aligned records, tabular numerics, a cell slot" },
    { name: "request-form", note: "schema-driven, one message per failed rule" },
  ];

  // The request book: the screen this block was lifted from. Six columns, two
  // of them numeric-and-tabular, one a pill, one prose.
  const requests = [
    { id: "req_9f2a41c8", state: "succeeded", tone: "ok", type: "databento_batch_download", estimate: "$0.0412", age: "1h 04m", why: "—" },
    { id: "req_4c81be07", state: "running", tone: "info", type: "databento_batch_download", estimate: "$0.1180", age: "12m", why: "lease valid, progress 82%" },
    { id: "req_b31d5e0a", state: "approved", tone: "info", type: "replay_csv", estimate: "$0.0021", age: "3h 51m", why: "unclaimed past the window" },
    { id: "req_0a7c9d33", state: "blocked", tone: "warn", type: "databento_batch_download", estimate: "—", age: "2d 06h", why: "waiting on a plan · $25" },
    { id: "req_e55f10b2", state: "failed", tone: "bad", type: "replay_csv", estimate: "$0.0009", age: "4d 01h", why: "repeat_failure ×3" },
  ];

  const requestColumns = [
    { label: "request", width: "minmax(9rem, 1.3fr)" },
    { label: "state", width: "7.5rem" },
    { label: "type", width: "minmax(7rem, 1fr)" },
    { label: "estimate", align: "end" },
    { label: "age", align: "end" },
    { label: "why it matters", width: "minmax(10rem, 1.7fr)" },
  ];

  const stats = [
    { label: "Requests today", value: "2,431", sub: "last 24 hours", tone: "info" },
    { label: "Succeeded", value: "2,398", sub: "98.6%", tone: "ok" },
    { label: "Failed", value: "33", sub: "1.4%", tone: "bad" },
  ];

  const results = [
    { title: "Interval scheduling under load", meta: "2026-11-12 · 8 min read", pill: { label: "new", tone: "ok" }, snippet: "The scheduler keeps a single sorted queue…" },
    { title: "Why the cache layer went cold", meta: "2026-11-11 · 5 min read", pill: { label: "read", tone: "" }, snippet: "A TTL is a promise about staleness…" },
    { title: "Small tools, sharp edges", meta: "2026-11-09 · 12 min read" },
    { title: "Registry shapes that survive", meta: "2026-11-08 · 6 min read" },
    { title: "The cost of a second stylesheet", meta: "2026-11-06 · 4 min read" },
    { title: "Reading a computed style", meta: "2026-11-04 · 9 min read" },
    { title: "Nine blocks, three projects", meta: "2026-11-02 · 7 min read" },
  ];

  // Deliberately *not* in the panel's shape: this is what an API emits, and
  // `adaptFacets` (new in 1.4.0) is what turns it into facets. The gallery shows
  // the adapter path because that is the one a real consumer needs.
  const rawFacets = {
    run: [{ value: "2026", count: 12 }, { value: "2025", count: 31 }, { value: "2024", count: 9 }],
    state: [{ value: "done", count: 42 }, { value: "stuck", count: 3 }],
    kind: [{ value: "request", count: 28 }, { value: "plan", count: 17 }],
  };
  const facetLabels = { run: "Run", state: "State", kind: "Kind" };
  // One facet is a *single* choice drawn as a histogram (`mode` and `layout`,
  // new in 1.7.0); the rest are the checkbox lists the panel always had.
  function adaptFacets(raw) {
    return Object.entries(raw).map(([key, options]) => ({
      key,
      label: facetLabels[key] ?? key,
      mode: key === "run" ? "single" : "multiple",
      layout: key === "run" ? "bars" : "list",
      note: key === "run" ? "one run, or all of them" : "",
      options: options.map((opt) => ({
        ...opt,
        label: opt.value.charAt(0).toUpperCase() + opt.value.slice(1),
      })),
    }));
  }
  let selected = $state({ state: ["done"] });

  const statusCards = [
    { title: "Pending", count: 2, tone: "", rows: [{ title: "req_8f21", meta: "queued 2m ago", pill: { label: "waiting", tone: "warn" } }] },
    { title: "Done", count: 2, tone: "ok", rows: [{ title: "req_8f19", meta: "1.2 GB", pill: { label: "ok", tone: "ok" } }, { title: "req_8f18", meta: "402 MB", pill: { label: "ok", tone: "ok" } }] },
    { title: "Stuck", count: 1, tone: "warn", rows: [{ title: "req_8f0e", meta: "no progress 40m", pill: { label: "stuck", tone: "warn" } }] },
    { title: "Blocked", count: 0, tone: "bad", rows: [] },
  ];

  const intervals = [
    { label: "00", count: 2 }, { label: "04", count: 5 }, { label: "08", count: 3 },
    { label: "12", count: 8 }, { label: "16", count: 4 }, { label: "20", count: 6 },
  ];
  const history = [
    { date: "11-14 09:12", label: "Top up", value: "£20.00", diff: "+20.00", note: "manual" },
    { date: "11-13 18:40", label: "Usage", value: "£4.12", diff: "−4.12", note: "chat + embedding" },
    { date: "11-12 11:02", label: "Usage", value: "£6.88", diff: "−6.88", note: "batch run" },
  ];

  const fields = [
    { name: "planType", label: "Plan type", type: "select", required: true, options: [{ value: "full", label: "Full archive" }, { value: "delta", label: "Since last run" }] },
    { name: "from", label: "From", type: "text", placeholder: "2026-01-01", required: true },
    { name: "limit", label: "Limit", type: "number", hint: "Maximum rows, 1–10000." },
  ];
  let formValues = $state({ planType: "delta", from: "", limit: 500 });
  const formErrors = { from: ["is required", "must be a date (YYYY-MM-DD)"] };
</script>

<div class="wrap">
  <header class="head">
    <div>
      <span class="micro">house design system</span>
      <h1 class="title">@nb UI Registry</h1>
      <p class="hint lede">
        One theme and ten blocks. Everything below is the published source, rendered —
        there is no screenshot and no separate gallery.
      </p>
    </div>
    <span class="pill ok num">v{manifest.version}</span>
  </header>

  <section class="card about" aria-labelledby="about-title">
    <h2 class="micro" id="about-title">what this is</h2>
    <dl class="facts">
      <div class="fact">
        <dt class="micro">one theme</dt>
        <dd>
          Colour, type, spacing and radii as CSS variables. Blocks read the variables
          and never a hex value, so re-skinning is one file, not ten.
        </dd>
      </div>
      <div class="fact">
        <dt class="micro">ten blocks</dt>
        <dd>
          The screens the house apps actually have — a shell, a KPI row, results,
          facets, lanes, a detail page, a chart, a form, an empty state.
        </dd>
      </div>
      <div class="fact">
        <dt class="micro">pinned by version</dt>
        <dd>
          The version is a path segment (<code class="num">/r/v{manifest.version}</code>).
          A published version never changes bytes, so a project can pin one and mean it.
        </dd>
      </div>
    </dl>
    <p class="hint how">
      A project takes these from the registry — <code class="num">npx shadcn-svelte add &lt;name&gt;</code>
      against this registry's URL — and genproj does it for you: give its ui-shadcn
      capability a <code class="num">blocks</code> list and it emits the pinned installs.
    </p>
  </section>

  <section class="card palette-card" aria-labelledby="palette-title">
    <h2 class="micro" id="palette-title">the palette, and what it means</h2>
    <p class="hint">
      These seven variables are the whole vocabulary. A block that needed a colour
      outside it would be a bug in the theme, not in the block.
    </p>
    <ul class="swatches">
      {#each palette as swatch}
        <li>
          <span class="swatch" style="background: var(--{swatch.token});"></span>
          <span class="swatch-name num">--{swatch.token}</span>
          <span class="hint">{swatch.means}</span>
        </li>
      {/each}
    </ul>
  </section>

  <nav class="jump" aria-label="Jump to a block">
    {#each blocks as block}
      <a class="pill info" href="#{block.name}">{block.name}</a>
    {/each}
  </nav>

  {#each blocks as block}
    <section class="block" id={block.name}>
      <div class="block-head">
        <h2 class="block-name"><code class="num">{block.name}</code></h2>
        <span class="hint">{block.note}</span>
      </div>

      {#if block.name === "app-shell"}
        <div class="shell-frame">
          <AppShell
            title="data-download"
            subtitle="house design system"
            status="live"
            titleTag="h3"
          >
            {#snippet mark()}
              <span class="fake-mark" aria-hidden="true"></span>
            {/snippet}
            {#snippet actions()}
              <nav class="fake-nav" aria-label="Primary">
                <a href="#app-shell">runs</a>
                <a href="#app-shell">plans</a>
              </nav>
            {/snippet}
            {#snippet back()}
              <button class="btn fake-back" type="button">← back</button>
            {/snippet}
            <p class="hint">Application content sits here, inside the 68rem main.</p>
          </AppShell>
        </div>
      {:else if block.name === "stat-strip"}
        <StatStrip {stats} />
      {:else if block.name === "result-list"}
        <ResultList items={results} initialCount={3} title="Matches" titleTag="h3">
          {#snippet row(item)}
            <div class="row-body">
              <div class="row-head">
                <span class="row-title">{item.title}</span>
                {#if item.pill}<span class="pill {item.pill.tone}">{item.pill.label}</span>{/if}
              </div>
              <div class="row-meta hint">{item.meta}</div>
              {#if item.snippet}
                <p class="row-snippet">… {item.snippet} <mark>{item.title.split(" ")[0]}</mark> …</p>
                <p class="hint">2 more passages</p>
              {/if}
            </div>
          {/snippet}
        </ResultList>
      {:else if block.name === "filter-panel"}
        <div class="narrow">
          <FilterPanel
            facets={rawFacets}
            {adaptFacets}
            {selected}
            onchange={(next) => (selected = next)}
            onclear={() => (selected = {})}
          />
        </div>
      {:else if block.name === "data-table"}
        <DataTable
          title="The request book"
          titleTag="h3"
          columns={requestColumns}
          items={requests}
          emptyMessage="No requests yet."
        >
          {#snippet row(request)}
            <span class="id"><code class="num">{request.id}</code></span>
            <span><span class="pill {request.tone}">{request.state}</span></span>
            <span>{request.type}</span>
            <span class="num">{request.estimate}</span>
            <span class="num">{request.age}</span>
            <span class="why">{request.why}</span>
          {/snippet}
        </DataTable>
      {:else if block.name === "empty-state"}
        <EmptyState cause="filters" onclear={() => {}} />
      {:else if block.name === "status-view"}
        <StatusView cards={statusCards} />
      {:else if block.name === "detail-panel"}
        <DetailPanel
          title="Intervals and the scheduler that keeps them"
          pill={{ label: "read", tone: "ok" }}
          meta={[
            { label: "Published", value: "2026-11-12" },
            { label: "Words", value: "1,204", isNum: true },
            { label: "Source", value: "stratechery", isCode: true },
          ]}
        >
          <p>Prose lives here. It inherits the body size and line height from the theme, not from the block.</p>
        </DetailPanel>
      {:else if block.name === "burst-timeline"}
        <BurstTimeline
          {intervals}
          {history}
          title="Balance history"
          orientation="horizontal"
          chartLabel="intervals today"
          showValues
        >
          {#snippet caption()}
            Requests per four-hour interval. A quiet interval is quiet, not missing.
          {/snippet}
        </BurstTimeline>
      {:else if block.name === "request-form"}
        <RequestForm {fields} bind:values={formValues} errors={formErrors} submitLabel="Create request" onsubmit={() => {}} />
      {/if}
    </section>
  {/each}

  <footer class="foot hint">
    <span>@nb/theme v{manifest.version} · ten blocks · published by <code class="num">npm run publish:item</code></span>
  </footer>
</div>

<style>
  .wrap {
    max-width: 68rem;
    margin: 0 auto;
    /* The status bar draws over the page on an iPhone home screen (see the
       --safe-* note in app.css). The page's own gutter is added to it rather
       than replacing it, so the header clears the clock. */
    padding: calc(16px + var(--safe-top, 0px)) calc(16px + var(--safe-right, 0px))
      calc(48px + var(--safe-bottom, 0px)) calc(16px + var(--safe-left, 0px));
  }

  .head {
    display: flex;
    gap: 12px;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid var(--line);
    padding-bottom: 12px;
    margin-bottom: 20px;
  }

  .title {
    margin: 4px 0 0;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .lede {
    margin: 6px 0 0;
    max-width: 40rem;
  }

  .about,
  .palette-card {
    padding: 14px 16px;
    margin-bottom: 16px;
  }

  .about h2,
  .palette-card h2 {
    margin: 0;
  }

  .facts {
    display: grid;
    gap: 14px;
    margin: 12px 0 0;
  }

  .fact dd {
    margin: 3px 0 0;
    color: var(--ink-dim);
    max-width: 44rem;
  }

  .how {
    margin: 14px 0 0;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }

  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 8px 16px;
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
  }

  .swatches li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 8px;
  }

  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    border: 1px solid var(--line-strong);
    flex: none;
    align-self: center;
  }

  .swatch-name {
    font-size: 11px;
    color: var(--ink);
  }

  .jump {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0 0 24px;
  }

  .jump .pill {
    font-size: 10px;
  }

  .block {
    margin-bottom: 40px;
  }

  .block-head {
    display: flex;
    gap: 12px;
    align-items: baseline;
    flex-wrap: wrap;
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--line);
  }

  .block-name {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }

  .narrow {
    max-width: 18rem;
  }

  /* Stand-ins for a consumer's own mark and nav, so the shell's two slots are
     visible rather than described. */
  .fake-mark {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    background: var(--accent-soft);
    border: 1px solid var(--accent);
  }

  .fake-nav {
    display: flex;
    gap: 10px;
    font-size: 11px;
  }

  .fake-back {
    padding: 2px 9px;
    font-size: 11px;
  }

  .row-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .row-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }

  .row-title {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--ink);
  }

  .row-snippet {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--ink-muted);
  }

  .shell-frame {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
    height: 260px;
    position: relative;
  }

  .foot {
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }
</style>
