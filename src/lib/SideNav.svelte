<script>
  /**
   * The left-hand navigation: every group, every block, one level, always in
   * the same order.
   *
   * This replaced a page that was also its own index. Fourteen demos stacked
   * with their headings in the content is a document you scroll, not a thing you
   * navigate: by the third demo the group heading was off-screen and the next
   * one read as another paragraph. A category column outside the content keeps
   * the structure visible while the demo is what changes -- the MUI/Ant Design
   * arrangement, where "where am I" is answered by the column and "what is this"
   * by the page.
   */
  import { page } from "$app/stores";
  import { groups, inGroup } from "$lib/catalogue.js";

  let path = $derived($page.url.pathname);
</script>

<nav class="nav" aria-label="All blocks">
  {#each groups as group}
    <div class="group">
      <p class="label">
        {group.label}<span class="count">{inGroup(group.slug).length}</span>
      </p>
      <ul>
        {#each inGroup(group.slug) as block}
          {@const current = path === `/blocks/${block.name}`}
          <li>
            <!-- `aria-current` is the state; the class is only how it looks. A
                 nav that marks the open item in colour alone is a nav a screen
                 reader cannot use. -->
            <a
              class="item"
              class:current
              href={`/blocks/${block.name}`}
              aria-current={current ? "page" : undefined}
            >
              <code class="num">{block.name}</code>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</nav>

<style>
  .nav {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 0 0 4px;
    padding: 0 8px;
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }

  .count {
    font-size: 10px;
    letter-spacing: 0;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    display: block;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    /* A hairline of the page ground on the left, so the active row's accent bar
       does not shift the text by a pixel when it appears. */
    border-left: 2px solid transparent;
    color: var(--ink-dim);
    text-decoration: none;
    font-size: 12px;
  }

  .item code {
    font-size: 12px;
  }

  .item:hover,
  .item:focus-visible {
    background: var(--bg-hover);
    color: var(--ink-strong);
  }

  .item.current {
    background: var(--accent-soft);
    border-left-color: var(--accent);
    color: var(--ink-strong);
  }
</style>
