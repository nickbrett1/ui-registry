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
  import { groups, inGroup, palette } from "$lib/catalogue.js";
  import InstallCommand from "$lib/InstallCommand.svelte";
  import BlockThumb from "$lib/BlockThumb.svelte";

  // `installBase` is this deployment's registry, read off the request by
  // `+layout.js`; without it the page still renders, and the command prints a
  // host that is obviously not one.
  let { data = {} } = $props();

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
  <!-- The bar already says the name, on every route. A heading repeating it two
       lines lower introduces the page to someone who just read the sign, and
       the sentence that used to sit under it ("one theme and 14 blocks, no
       screenshot, no separate gallery") is a claim about the site rather than
       a way into it -- it also dates itself every time a block is added.
       The outline still needs a root, though: the group cards are h2s, so the
       name stays for a screen reader and leaves the eye alone. -->
  <h1 class="sr-only">@nb UI Registry</h1>

  <div class="groups">
    {#each groups as group}
      <section class="card group" aria-labelledby="g-{group.slug}">
        <h2 class="group-label" id="g-{group.slug}">{group.label}</h2>
        <p class="hint group-note">{group.note}</p>
        <ul class="tiles">
          {#each inGroup(group.slug) as block}
            <li><BlockThumb name={block.name} /></li>
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
  /* Present in the document, absent from the page: the only heading a sighted
     reader needs here is the group they are looking for. */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  /* One card per group, stacked: the tiles are a fixed size (see BlockThumb),
     so the card is a shelf they wrap along rather than a column that squeezes
     them. Side by side, five groups leave 180px each -- one tile, and a
     thumbnail too small to recognise. */
  .groups {
    display: grid;
    gap: 14px;
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

  /* Tiles wrap along the card, so a wide screen shows a group in one row and a
     phone shows two per row -- the number follows the width, the tile does not
     (it is fixed, because the preview inside it is a scaled 600px canvas). */
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, 168px);
    gap: 14px 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  @media (max-width: 26rem) {
    .tiles {
      grid-template-columns: repeat(auto-fill, 132px);
      gap: 12px 10px;
    }
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
