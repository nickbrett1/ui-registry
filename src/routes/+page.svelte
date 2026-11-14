<script>
  // The landing page. The version is *read*, not written down: importing the
  // published manifest means the page cannot advertise a version the registry
  // does not serve, which is the one thing a "docs" page in a registry must not
  // get wrong.
  import published from "../../registry/versions/manifest.json";

  const versions = [...new Set(published.items.map((item) => item.version))];
  const latest = versions.sort((a, b) => {
    const [x, y] = [a.split(".").map(Number), b.split(".").map(Number)];
    for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  })[versions.length - 1];
  const manifest = { version: latest };
</script>

<div style="max-width: 68rem; margin: 0 auto; padding: 24px 16px;">
  <header style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid var(--line); padding-bottom: 12px; margin-bottom: 24px;">
    <div>
      <span class="micro" style="display: block;">house design system</span>
      <h1 style="margin: 4px 0 0; font-size: 18px; font-weight: 600; letter-spacing: -0.01em;">@nb UI Registry</h1>
    </div>
    <div style="display: flex; gap: 8px; align-items: center;">
      <a class="btn" href="/blocks">browse the blocks</a>
      <span class="pill ok">v{manifest.version}</span>
    </div>
  </header>

  <section class="card" style="padding: 16px; margin-bottom: 20px;">
    <p class="micro" style="margin-top: 0;">consumer install</p>
    <pre style="background: var(--bg-sunken); border: 1px solid var(--line); border-radius: 6px; padding: 12px; overflow-x: auto; margin: 8px 0 0;"><code class="num">COMPONENTS_REGISTRY_URL=http://ryzen:3012/r/v{manifest.version} \
  npx shadcn-svelte@1.8.1 add theme --yes --overwrite</code></pre>
  </section>

  <section class="card" style="padding: 16px;">
    <p class="micro" style="margin-top: 0;">tokens at work</p>
    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">
      <span class="pill ok">matched</span>
      <span class="pill warn">pending</span>
      <span class="pill bad">failed</span>
      <span class="pill info">active</span>
      <span class="pill">default</span>
    </div>
    <p class="hint" style="margin: 12px 0 0;">
      Highlight uses <mark>cream</mark> (<code class="num">var(--mark)</code>), the one warm note in the palette.
    </p>
  </section>
</div>
