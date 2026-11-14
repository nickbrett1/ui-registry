<script>
  // The theme. `src/app.css` *is* the canonical source of `@nb/theme` -- this
  // import is what makes it live in the app and in the gallery later, and it is
  // the same file `registry.json` registers as the theme item.
  import "../app.css";

  let { children } = $props();
</script>

{@render children()}
