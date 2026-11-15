<script>
  /**
   * The bar across the top of every page: the name of the thing you are on, the
   * registry release being served, and the commit this bundle was built from.
   *
   * Two different facts, and telling them apart matters: the version pill is the
   * release, the build stamp is the document. A page can be on the current
   * release and still be an old bundle -- that is exactly how a shipped fix
   * looked broken on a phone.
   */
  import { latestVersion } from "$lib/catalogue.js";
</script>

<header class="top">
  <a class="brand" href="/">
    <span class="micro">house design system</span>
    <span class="name">@nb UI Registry</span>
  </a>
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
</style>
