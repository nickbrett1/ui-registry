<script>
  /**
   * The front door: what this registry serves, in five categories, and the
   * vocabulary the blocks are drawn with.
   *
   * It is deliberately *not* the demos. Fourteen rendered screens down one page
   * made the headings the content -- each demo's title sat under the previous
   * demo's output, and the group a shape belonged to had scrolled away long
   * before the shape did. A block now has its own page, reached from the column
   * on the left or from the category card below, and this page is only an index:
   * five sentences, five lists of names, one palette, and the line that installs
   * from it.
   */
  import { onMount } from "svelte";
  import {
    groups,
    inGroup,
    palette,
    publishedBlockCount,
  } from "$lib/catalogue.js";
  import InstallCommand from "$lib/InstallCommand.svelte";

  // `installBase` is this deployment's registry, read off the request by
  // `+layout.js`; without it the page still renders, and the command prints a
  // host that is obviously not one.
  let { data = {} } = $props();

  const blockCount = publishedBlockCount;

  // The top of the viewport is composited by the OS, not by us, so "the fix is
  // not working" and "the fix is not running" look exactly the same on a phone.
  // These three facts tell them apart, and they are *measured* from the document
  // that is actually running rather than written down: is this a standalone
  // window, what top inset does the engine resolve, and is the colour surface
  // switched on here. A phone showing "tab" or "surface off" is a configuration
  // answer, not a CSS one.
  let device = $state({ mode: "…", top: null, surface: "…" });

  onMount(() => {
    const mq = (query) => window.matchMedia?.(query)?.matches ?? false;
    const standalone =
      mq("(display-mode: standalone)") ||
      mq("(display-mode: fullscreen)") ||
      navigator.standalone === true;
    // The only way to read an env() value is to ask an element that uses it.
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;top:0;left:0;width:0;height:0;padding-top:env(safe-area-inset-top,0px)";
    document.body.appendChild(probe);
    const top = Number.parseFloat(getComputedStyle(probe).paddingTop) || 0;
    probe.remove();
    const surface = document.querySelector(".pwa-status-bar-surface");
    device = {
      mode: standalone ? "standalone" : "tab",
      top,
      surface:
        surface && getComputedStyle(surface).display !== "none" ? "on" : "off",
    };
  });
</script>

<div class="page">
  <header class="head">
    <h1 class="title">@nb UI Registry</h1>
    <p class="lede">
      One theme and {blockCount} blocks. Everything here is the published source,
      rendered — there is no screenshot and no separate gallery.
    </p>
  </header>

  <div class="groups">
    {#each groups as group}
      <section class="card group" aria-labelledby="g-{group.slug}">
        <h2 class="group-label" id="g-{group.slug}">{group.label}</h2>
        <p class="hint group-note">{group.note}</p>
        <ul>
          {#each inGroup(group.slug) as block}
            <li>
              <a href={`/blocks/${block.name}`}>
                <code class="num">{block.name}</code>
                <span class="go" aria-hidden="true">→</span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>

  <section class="card palette-card" aria-labelledby="palette-title">
    <h2 class="group-label" id="palette-title">the palette, and what it means</h2>
    <p class="hint group-note">
      These {palette.length} variables are the whole vocabulary. A block that
      needed a colour outside it would be a bug in the theme, not in the block.
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

  <section class="card install-card" aria-labelledby="install-title">
    <h2 class="group-label" id="install-title">install</h2>
    <p class="hint group-note">
      The theme first — the blocks are drawn with its palette — then the block you
      want. Swap <code class="num">bar-series</code> for any name above; each
      block's own page prints its own line.
    </p>
    <InstallCommand base={data.installBase} items={["theme", "bar-series"]} />
  </section>

  <footer class="foot">
    <!-- Diagnostic, not documentation: here to be read off a phone in one glance
         and then ignored. -->
    <p
      class="hint device"
      title="display mode · the status-bar inset this engine resolves · whether the top-edge colour surface is displayed"
    >
      {device.mode} · top {device.top ?? "?"}px · surface {device.surface}
    </p>
  </footer>
</div>

<style>
  .head {
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--line);
  }

  .title {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .lede {
    margin: 6px 0 0;
    max-width: 38rem;
    color: var(--ink-muted);
    font-size: 13.5px;
    line-height: 1.5;
  }

  .groups {
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    margin-bottom: 14px;
  }

  .group {
    padding: 14px 16px 10px;
    margin: 0;
  }

  .group-label {
    margin: 0;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-strong);
  }

  .group-note {
    margin: 4px 0 10px;
    font-size: 11.5px;
    line-height: 1.4;
  }

  .group ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* One name per line, the name in the monospace the blocks use, so the index
     teaches the vocabulary the rest of the site speaks. */
  .group a {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 5px 0;
    border-top: 1px solid var(--line);
    color: var(--ink-dim);
    text-decoration: none;
    font-size: 12px;
  }

  .group a:hover,
  .group a:focus-visible {
    color: var(--ink-strong);
    background: var(--bg-hover);
  }

  .go {
    color: var(--ink-faint);
    font-size: 11px;
  }

  .group a:hover .go {
    color: var(--accent);
  }

  .palette-card,
  .install-card {
    padding: 14px 16px;
  }

  .install-card {
    margin-bottom: 14px;
  }

  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 8px 16px;
    list-style: none;
    margin: 10px 0 0;
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

  .foot {
    margin-top: 24px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--ink-muted);
  }

  .foot p {
    margin: 0;
  }

  .device {
    font-family: var(--mono);
    font-size: 10px;
    opacity: 0.75;
  }
</style>
