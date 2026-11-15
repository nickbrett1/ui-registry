<script>
  /**
   * The install line, as a line: one command, copyable, with this deployment's
   * URL and this release's pin already in it.
   *
   * The text this replaced said "take one with `npx shadcn-svelte add <name>`
   * against this registry's URL", which is a sentence *about* a command: the
   * reader still has to know the host, know that the pin is a path segment
   * rather than a flag, and know that `--yes` alone silently does nothing. All
   * three are settled in `$lib/install.js`; here they are just printed.
   *
   * `base` comes from the layout's load, which reads it off the request. The
   * fallback only appears when a page is rendered without that load (a unit
   * test), and it is deliberately not a real host, so it cannot be pasted by
   * mistake and believed.
   */
  import { latestVersion } from "$lib/catalogue.js";
  import { installCommand } from "$lib/install.js";

  let { base = "", items = [] } = $props();

  const command = $derived(
    installCommand({
      base: base || `https://<host>/r/v${latestVersion}`,
      items,
    }),
  );

  // Clipboard access is refused on an insecure origin and absent in jsdom, so
  // the button is a convenience and the text below is the contract: a copy that
  // silently did nothing would be worse than no button at all.
  let copied = $state(false);
  let reset;

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      return;
    }
    copied = true;
    clearTimeout(reset);
    reset = setTimeout(() => (copied = false), 1600);
  }
</script>

<div class="install">
  <pre class="cmd"><code class="num">{command}</code></pre>
  <button
    class="copy num"
    type="button"
    onclick={copy}
    aria-label="Copy the install command"
  >
    {copied ? "copied" : "copy"}
  </button>
</div>

<style>
  .install {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }

  /* Wrapped, not scrolled: a phone cannot see past the end of a long line, and
     the end is the part with `--overwrite` in it. */
  .cmd {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 7px 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--bg-sunken);
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1.55;
    color: var(--ink-dim);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .copy {
    flex: none;
    min-height: var(--tap);
    padding: 0 10px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--ink-faint);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .copy:hover,
  .copy:focus-visible {
    border-color: var(--accent-line);
    color: var(--ink-strong);
  }
</style>
