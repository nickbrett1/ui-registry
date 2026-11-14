<script>
  /**
   * BurstTimeline — interval chart + historical audit grid.
   *
   * Displays a bar chart of activity intervals followed by a history table with
   * comparison columns ("Explains"). Lifted from deepseek-balance and
   * data-download §8.
   *
   * Two additions in 1.4.0:
   *
   *   `orientation` -- `"vertical"` (hours down the day, as deepseek-balance
   *       draws it) or `"horizontal"` (one bar per bucket, labels down the left,
   *       as a year-by-year archive wants). The same data; only the axis moves.
   *   `chartLabel`  -- the caption over the chart. It was hard-coded to "recent
   *       bursts", so a caller with intervals that are not bursts had to choose
   *       between a wrong word and not using the block. Empty string hides it.
   */
  let {
    intervals = [],
    history = [],
    title = "Activity & History",
    chartLabel = "recent bursts",
    orientation = "vertical",
  } = $props();

  const horizontal = $derived(orientation === "horizontal");

  const maxVal = $derived(
    intervals.reduce((m, x) => Math.max(m, x.count ?? 0), 1),
  );
</script>

<div class="timeline-wrap">
  <div class="section-title">{title}</div>

  <!-- Sparkline burst chart (SVG) -->
  {#if intervals.length > 0}
    <div class="card chart-card">
      {#if chartLabel}
        <div class="micro chart-title">{chartLabel}</div>
      {/if}
      <div class="chart-bars" class:horizontal>
        {#each intervals as interval}
          {@const pct = Math.round(((interval.count ?? 0) / maxVal) * 100)}
          <div class="bar-col" title="{interval.label}: {interval.count}">
            <div class="bar-track">
              <div class="bar-fill" style="--pct: {pct}%;"></div>
            </div>
            <span class="bar-label num hint">{interval.label}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- History grid -->
  {#if history.length > 0}
    <div class="card history-card">
      <div class="history-head micro">
        <span>Timestamp</span>
        <span>Event</span>
        <span class="num-col">Value</span>
        <span>Explains</span>
      </div>
      {#each history as row, idx}
        <div class="history-row" class:border-top={idx > 0}>
          <span class="num hint">{row.date}</span>
          <span class="row-event">{row.label}</span>
          <span class="num num-col">{row.value}</span>
          <span class="row-explains hint">
            {#if row.diff}
              <code class="diff-chip">{row.diff}</code>
            {/if}
            {row.note ?? ""}
          </span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .timeline-wrap {
    margin-bottom: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .chart-card {
    padding: 14px;
    background: var(--bg-sunken);
  }

  .chart-title {
    margin-bottom: 12px;
  }

  .chart-bars {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    height: 72px;
    padding-top: 8px;
  }

  .bar-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    height: 100%;
  }

  .bar-track {
    width: 100%;
    flex: 1;
    background: var(--line);
    border-radius: 3px;
    display: flex;
    align-items: flex-end;
    overflow: hidden;
  }

  /* The fill is driven by one custom property and the orientation decides which
     axis spends it, so there is no second copy of the chart markup. */
  .bar-fill {
    width: 100%;
    height: var(--pct, 0%);
    background: var(--accent);
    border-radius: 3px 3px 0 0;
    min-height: 2px;
    transition:
      height 0.2s ease,
      width 0.2s ease;
  }

  .chart-bars.horizontal {
    flex-direction: column;
    align-items: stretch;
    height: auto;
    gap: 6px;
  }

  .chart-bars.horizontal .bar-col {
    flex-direction: row-reverse;
    align-items: center;
    gap: 10px;
    height: auto;
  }

  .chart-bars.horizontal .bar-label {
    width: 5rem;
    flex: none;
    text-align: right;
  }

  .chart-bars.horizontal .bar-track {
    height: 10px;
    flex: 1;
  }

  .chart-bars.horizontal .bar-fill {
    width: var(--pct, 0%);
    height: 100%;
    border-radius: 0 3px 3px 0;
  }

  .bar-label {
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .history-card {
    overflow: hidden;
  }

  .history-head {
    display: grid;
    grid-template-columns: 140px 1fr 100px 1.5fr;
    gap: 12px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
    background: var(--bg-sunken);
  }

  .history-row {
    display: grid;
    grid-template-columns: 140px 1fr 100px 1.5fr;
    gap: 12px;
    align-items: center;
    padding: 8px 12px;
    font-size: 12.5px;
  }

  .history-row.border-top {
    border-top: 1px solid var(--line);
  }

  .num-col {
    text-align: right;
  }

  .diff-chip {
    margin-right: 4px;
  }

  @media (max-width: 600px) {
    .history-head,
    .history-row {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .num-col {
      text-align: left;
    }
  }
</style>
