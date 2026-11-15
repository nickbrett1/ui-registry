<script>
  /**
   * One block, as a picture of itself.
   *
   * The index used to be text: fourteen names in five lists, which told a reader
   * the vocabulary but not what any of it looked like -- "burst-timeline" and
   * "meter-strip" are not words that describe their shape, so choosing one meant
   * opening it and coming back. A tile shows the block, drawn small.
   *
   * It is a *render*, not a screenshot: the same `BlockDemo` the block's own page
   * mounts, laid out on a fixed 600px canvas and scaled down. That matters more
   * than it sounds -- a PNG would be one more artifact to regenerate on every
   * theme change, and it would go stale silently, showing a shape the registry
   * no longer serves. A scaled render cannot disagree with the page it links to.
   *
   * The preview is inert and hidden from assistive tech: it is a picture of a
   * block on a different page, so a button inside it that cannot be pressed (and
   * would not do anything if it could) must not be reachable by keyboard or
   * announced. The name below it is the link's only accessible text.
   */
  import BlockDemo from "$lib/BlockDemo.svelte";

  let { name } = $props();
</script>

<a class="tile" href={`/blocks/${name}`}>
  <span class="thumb" aria-hidden="true" inert>
    <span class="frame"><BlockDemo {name} /></span>
  </span>
  <code class="num name">{name}</code>
</a>

<style>
  /* The tile is a fixed width because the picture is: the demo is laid out at
     `--demo-w` and then scaled by `--k`, so the two numbers have to agree --
     --w = --demo-w * --k. Layout depends on it (a scale that does not match
     leaves a gap on the right or clips the block), which is why they are
     declared together and changed together. */
  .tile {
    --demo-w: 600px;
    --k: 0.28;
    --w: 168px;
    display: block;
    text-decoration: none;
  }

  .thumb {
    display: block;
    position: relative;
    width: var(--w);
    height: calc(var(--w) * 0.625);
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--bg-raised);
    /* The preview is a picture of another page: nothing inside it is a control
       here, so nothing inside it should look like one. */
    pointer-events: none;
    user-select: none;
  }

  .frame {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    width: var(--demo-w);
    height: calc(var(--demo-w) * 0.625);
    transform: scale(var(--k));
    transform-origin: 0 0;
    /* Demos are drawn for a page, and a page has a ground; without one the
       blocks that expect the theme's body colour read as flat grey rectangles. */
    background: var(--bg);
    color: var(--ink);
    padding: 14px;
  }

  .name {
    display: block;
    margin-top: 6px;
    font-size: 11.5px;
    color: var(--ink-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tile:hover .thumb,
  .tile:focus-visible .thumb {
    border-color: var(--accent-line);
  }

  .tile:hover .name,
  .tile:focus-visible .name {
    color: var(--ink-strong);
  }

  /* A phone fits two tiles across at 132px; the scale follows the width, since
     a preview that is scaled to the wrong size is a preview of a different
     layout. */
  @media (max-width: 26rem) {
    .tile {
      --k: 0.22;
      --w: 132px;
    }
  }
</style>
