<script>
  /**
   * The site frame: a bar across the top, a column of categories on the left,
   * the page you asked for on the right.
   *
   * The categories are *outside* the content on purpose. When they were inside
   * it -- a block of group headings running down one long page -- the heading a
   * reader needed was always the one that had just scrolled away, and a demo
   * starting under a heading read as a continuation of it. Here the structure
   * holds still and only the demo changes, which is the MUI / Ant Design
   * arrangement: the column answers "where am I", the page answers "what is it".
   */
  import "../app.css";
  import { page } from "$app/stores";
  import SiteHeader from "$lib/SiteHeader.svelte";
  import SideNav from "$lib/SideNav.svelte";
  import { publishedBlockCount } from "$lib/catalogue.js";

  let { children } = $props();
</script>

<SiteHeader path={$page.url.pathname} />

<div class="body">
  <!-- One nav, rendered twice, because a phone and a desktop need different
       containers for it and neither can be expressed as the other: on a narrow
       screen it is a drawer above the page, on a wide one a sticky column
       beside it. Two loops over the same list, never two lists. -->
  <details class="drawer">
    <summary>
      all blocks<span class="count">{publishedBlockCount}</span>
    </summary>
    <SideNav />
  </details>

  <aside class="sidebar" aria-label="Blocks">
    <SideNav />
  </aside>

  <main class="main">
    {@render children()}
  </main>
</div>

<style>
  .body {
    display: flex;
    gap: 40px;
    max-width: 84rem;
    margin: 0 auto;
    padding: 0 calc(16px + var(--safe-right, 0px)) calc(48px + var(--safe-bottom, 0px))
      calc(16px + var(--safe-left, 0px));
  }

  /* 3.1rem is the bar the column sits under: two lines of type plus its padding
     and border (see SiteHeader). It is a reservation, not a measurement -- the
     column is sticky, so a few pixels of slack costs nothing and a few pixels of
     overlap hides the first group's label. */
  .sidebar {
    flex: none;
    width: 13rem;
    position: sticky;
    top: calc(3.1rem + var(--safe-top, 0px));
    align-self: flex-start;
    max-height: calc(100dvh - 3.1rem - var(--safe-top, 0px));
    overflow-y: auto;
    overscroll-behavior-y: contain;
    padding: 22px 0 32px;
    /* The column scrolls on its own once it outgrows the viewport, so the nav
       never takes the page's scrollbar with it. */
    scrollbar-width: thin;
  }

  .main {
    flex: 1;
    min-width: 0;
    padding: 22px 0;
  }

  .drawer {
    display: none;
  }

  @media (max-width: 56rem) {
    .body {
      flex-direction: column;
      gap: 0;
    }

    .sidebar {
      display: none;
    }

    .drawer {
      display: block;
      margin-top: 12px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--bg-raised);
    }

    .drawer summary {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding: 9px 12px;
      cursor: pointer;
      font-size: 12px;
      color: var(--ink);
      /* The tap target is the whole row, and iOS will not give a <summary>
         one for free. */
      min-height: var(--tap);
    }

    .drawer summary .count {
      font-family: var(--mono);
      font-size: 10px;
      color: var(--ink-faint);
    }

    .drawer[open] summary {
      border-bottom: 1px solid var(--line);
    }

    .drawer :global(.nav) {
      padding: 12px;
    }
  }
</style>
