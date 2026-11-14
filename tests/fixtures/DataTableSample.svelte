<script>
  // A real consumer of DataTable, so the tests exercise the contract a page
  // uses (`{#snippet row(item)}` returning cells) rather than a raw string.
  import DataTable from "../../blocks/data-table/DataTable.svelte";

  let { columns, items, title = "", titleTag = "div", emptyMessage } = $props();
</script>

<DataTable {columns} {items} {title} {titleTag} {emptyMessage}>
  {#snippet row(item)}
    <span class="id">{item.id}</span>
    <span class="num">{item.estimate}</span>
  {/snippet}
</DataTable>
