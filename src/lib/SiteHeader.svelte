<script>
  /**
   * The bar across the top of every page: where you can go back to, the name of
   * the thing you are on, the registry release being served, and the commit this
   * bundle was built from.
   *
   * The back link is not decoration. This registry is used as an installed web
   * app -- a home-screen window with no browser chrome and therefore no back
   * button -- so a block page with no way home is a dead end: the column is
   * collapsed on a phone, the page's own footer only walks forwards, and the
   * only other route is a gesture the platform does not offer. "← index" is
   * always in the same place, on every page but the index itself.
   *
   * Two different facts, and telling them apart matters: the version pill is the
   * release, the build stamp is the document. A page can be on the current
   * release and still be an old bundle -- that is exactly how a shipped fix
   * looked broken on a phone.
   */
  import { latestVersion } from "$lib/catalogue.js";

  // The path is a prop, not a read of `$page`: this is a presentational bar and
  // the frame knows where it is. It also keeps the component renderable on its
  // own, which is how the back link is tested without a router.
  let { path = "/" } = $props();

  const onIndex = $derived(path === "/");
</script>

<header class="top">
  <div class="lead">
    {#if !onIndex}
      <!-- A link, not history.back(): a page opened from a bookmark or a shared
           URL has no history to go back to, and the index is the destination
           anyway. -->
      <a class="back" href="/" aria-label="Back to the index">
        <span aria-hidden="true">←</span> index
      </a>
    {/if}
    <a class="brand" href="/">
      <span class="micro">house design system</span>
      <span class="name">@nb UI Registry</span>
    </a>
  </div>
  <div class="meta">
    <span class="pill ok num" title="the registry release the page is reading"
      >v{latestVersion}</span
    >
    <span class="pill num" title="the commit this bundle was built from"
      >build {__NB_BUILD__}</span
    >
  </div>
</header>

<style>
  /* The page's own chrome, and the only element at the top edge of the
     viewport, so it owns the status-bar band with padding (not a `top` offset:
     a sticky element offset by 47px paints there while its flow box stays put,
     and hides the first line of whatever it is meant to reveal). It is a SOLID
     surface, not a glass one -- iOS composites that band through a translucent
     layer and lifts the whole strip into a grey smear. See the --safe-* note in
     app.css. */
  .top {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: calc(9px + var(--safe-top, 0px)) calc(16px + var(--safe-right, 0px))
      9px calc(16px + var(--safe-left, 0px));
    background: var(--bg);
    border-bottom: 1px solid var(--line);
  }

  .lead {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  /* A control, not a caption: it is the only way home on a phone, so it gets a
     border and a tap target rather than being styled like a stray word. */
  .back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
    padding: 4px 9px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-pill);
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1;
    color: var(--ink-dim);
    text-decoration: none;
  }

  .back:hover,
  .back:focus-visible {
    border-color: var(--accent-line);
    background: var(--bg-hover);
    color: var(--ink-strong);
  }

  .brand {
    display: flex;
    flex-direction: column;
    gap: 1px;
    text-decoration: none;
    min-width: 0;
  }

  .brand .micro {
    color: var(--ink-faint);
  }

  .name {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--ink-strong);
  }

  .meta {
    display: flex;
    gap: 6px;
    flex: none;
  }

  .meta .pill {
    font-size: 10px;
    padding: 3px 8px;
  }

  @media (max-width: 30rem) {
    /* The back pill already says where you are; the subtitle is the first thing
       to go when the bar has to hold a control, a name and two stamps. */
    .brand .micro {
      display: none;
    }

    .name {
      font-size: 14px;
    }
  }

  @media (max-width: 24rem) {
    /* Last resort: the build stamp is diagnostic, the release pill is the fact
       a bug report needs. */
    .meta .pill:last-child {
      display: none;
    }
  }
</style>
