<script>
  /**
   * The gallery: every block, rendered from `blocks/` -- the same source files
   * the registry publishes, imported directly rather than copied. If a block
   * does not render, this page does not build, which is the cheapest possible
   * check that nine published items are nine working components.
   */
  import AppShell from "../../../blocks/app-shell/AppShell.svelte";
  import StatStrip from "../../../blocks/stat-strip/StatStrip.svelte";
  import ResultList from "../../../blocks/result-list/ResultList.svelte";
  import FilterPanel from "../../../blocks/filter-panel/FilterPanel.svelte";
  import EmptyState from "../../../blocks/empty-state/EmptyState.svelte";
  import StatusView from "../../../blocks/status-view/StatusView.svelte";
  import DetailPanel from "../../../blocks/detail-panel/DetailPanel.svelte";
  import BurstTimeline from "../../../blocks/burst-timeline/BurstTimeline.svelte";
  import RequestForm from "../../../blocks/request-form/RequestForm.svelte";

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

  const facets = [
    { key: "state", label: "State", options: [{ value: "done", label: "Done", count: 42 }, { value: "stuck", label: "Stuck", count: 3 }] },
    { key: "kind", label: "Kind", options: [{ value: "request", label: "Request", count: 28 }, { value: "plan", label: "Plan", count: 17 }] },
  ];
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
      <span class="micro">@nb/blocks · v1.3.0</span>
      <h1 class="title">Nine blocks, rendered</h1>
    </div>
    <span class="pill info">{9} items</span>
  </header>

  <p class="hint lede">
    Every block below is imported from <code>blocks/</code> — the same bytes <code>registry.json</code>
    publishes — and rendered against sample data. A block that does not render breaks this build.
  </p>

  {#each [
    { name: "app-shell", note: "sticky bar, 68rem main, footer" },
    { name: "stat-strip", note: "label · big tabular value · sub-line" },
    { name: "result-list", note: "ranked rows with a fold" },
    { name: "filter-panel", note: "facets on desktop, chip + sheet on a phone" },
    { name: "empty-state", note: "cause-aware zero results" },
    { name: "status-view", note: "four lanes, counts in the head" },
    { name: "detail-panel", note: "header, metadata grid, prose" },
    { name: "burst-timeline", note: "interval chart + audit grid" },
    { name: "request-form", note: "schema-driven, one message per failed rule" },
  ] as block}
    <section class="block">
      <div class="block-head">
        <code class="num">{block.name}</code>
        <span class="hint">{block.note}</span>
      </div>

      {#if block.name === "app-shell"}
        <div class="shell-frame">
          <AppShell title="data-download" subtitle="house design system" status="live">
            <p class="hint">Application content sits here, inside the 68rem main.</p>
          </AppShell>
        </div>
      {:else if block.name === "stat-strip"}
        <StatStrip {stats} />
      {:else if block.name === "result-list"}
        <ResultList items={results} initialCount={3} title="Matches" />
      {:else if block.name === "filter-panel"}
        <div class="narrow">
          <FilterPanel {facets} {selected} onchange={(next) => (selected = next)} onclear={() => (selected = {})} />
        </div>
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
        <BurstTimeline {intervals} {history} title="Balance history" />
      {:else if block.name === "request-form"}
        <RequestForm {fields} bind:values={formValues} errors={formErrors} submitLabel="Create request" onsubmit={() => {}} />
      {/if}
    </section>
  {/each}
</div>

<style>
  .wrap {
    max-width: 68rem;
    margin: 0 auto;
    padding: 24px 16px 48px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid var(--line);
    padding-bottom: 12px;
  }

  .title {
    margin: 4px 0 0;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .lede {
    margin: 12px 0 24px;
    max-width: 44rem;
  }

  .block {
    margin-bottom: 40px;
  }

  .block-head {
    display: flex;
    gap: 12px;
    align-items: baseline;
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--line);
  }

  .narrow {
    max-width: 18rem;
  }

  .shell-frame {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
    height: 260px;
    position: relative;
  }
</style>
