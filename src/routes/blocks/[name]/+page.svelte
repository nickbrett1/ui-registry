<script>
  /**
   * One block: its name, one sentence about what it is for, the demo, and the
   * way to the next one.
   *
   * The whole point of the split is that the heading is a heading again. On the
   * one-page gallery each block's title sat directly under the previous demo's
   * output with a hairline between them, so the reader could not tell a new
   * shape from the tail of the last one; here the name is the page's h1 and
   * nothing else competes with it.
   */
  import BlockDemo from "$lib/BlockDemo.svelte";
  import InstallCommand from "$lib/InstallCommand.svelte";
  import { blockByName, groupOf, neighbours } from "$lib/catalogue.js";

  let { data } = $props();

  // `installBase` arrives from `+layout.js` with the page's own name: the
  // command on a block page names that block, so the reader never has to
  // translate "<name>" into the thing they are looking at.
  const installBase = $derived(data.installBase || "");

  const block = $derived(blockByName(data.name));
  const group = $derived(groupOf(block.group));
  const steps = $derived(neighbours(block.name));
</script>

<svelte:head>
  <title>{block.name} · @nb UI Registry</title>
  <meta name="description" content={block.note} />
</svelte:head>

<article class="page">
  <nav class="crumbs" aria-label="Breadcrumb">
    <a href="/">index</a>
    <span aria-hidden="true">/</span>
    <span>{group.label}</span>
  </nav>

  <header class="head">
    <h1 class="name"><code class="num">{block.name}</code></h1>
    <p class="note">{block.note}</p>
  </header>

  <div class="stage">
    <BlockDemo name={block.name} />
  </div>

  <footer class="foot">
    <div class="get">
      <p class="install-label hint">install</p>
      <InstallCommand base={installBase} items={["theme", block.name]} />
    </div>
    <nav class="pager" aria-label="Previous and next block">
      {#if steps.prev}
        <a class="step prev" href={`/blocks/${steps.prev.name}`}>
          <span class="dir">← previous</span>
          <code class="num">{steps.prev.name}</code>
        </a>
      {:else}
        <span></span>
      {/if}
      {#if steps.next}
        <a class="step next" href={`/blocks/${steps.next.name}`}>
          <span class="dir">next →</span>
          <code class="num">{steps.next.name}</code>
        </a>
      {/if}
    </nav>
  </footer>
</article>

<style>
  .crumbs {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }

  .crumbs a {
    color: var(--ink-faint);
    text-decoration: none;
  }

  .crumbs a:hover,
  .crumbs a:focus-visible {
    color: var(--accent);
  }

  .head {
    margin-bottom: 18px;
  }

  .name {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .name code {
    font-size: inherit;
    color: var(--ink-strong);
  }

  .note {
    margin: 4px 0 0;
    max-width: 34rem;
    font-size: 13px;
    line-height: 1.5;
    color: var(--ink-muted);
  }

  /* The demo gets a surface of its own, so it is obvious where the block ends
     and the page begins: a block measured against the page ground and a block
     drawn on a card look different, and a consumer comparing the demo to their
     own screen needs to know which one they are looking at. */
  .stage {
    padding: 24px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg-raised);
    overflow-x: auto;
  }

  @media (max-width: 40rem) {
    .stage {
      padding: 16px 12px;
    }
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 24px;
    align-items: center;
    justify-content: space-between;
    margin-top: 18px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }

  /* The command sits under the demo, in a block wide enough to read it: the
     footer shares its row with the pager, so it takes the whole width until the
     pager can fit beside it. */
  .get {
    flex: 1 1 22rem;
    min-width: 0;
  }

  .install-label {
    margin: 0 0 4px;
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }

  .pager {
    display: flex;
    gap: 10px;
    align-items: stretch;
  }

  .step {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 8rem;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    text-decoration: none;
    font-size: 12px;
    color: var(--ink);
  }

  .step.next {
    text-align: right;
    margin-left: auto;
  }

  .step:hover,
  .step:focus-visible {
    border-color: var(--accent-line);
    background: var(--bg-hover);
  }

  .step .dir {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
</style>
