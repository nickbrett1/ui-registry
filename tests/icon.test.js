import { describe, it, expect } from "vitest";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd());

describe("home-screen / PWA icon contract", () => {
  it("src/app.html references the apple-touch-icon, manifest and theme-color", async () => {
    const html = await readFile(path.join(ROOT, "src", "app.html"), "utf8");
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('href="%sveltekit.assets%/apple-touch-icon.png"');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('name="theme-color" content="#0b1220"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
  });

  it("static/ manifest carries house styling and icon entries", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(ROOT, "static", "manifest.webmanifest"), "utf8"),
    );
    expect(manifest.background_color).toBe("#0b1220");
    expect(manifest.theme_color).toBe("#0b1220");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });

  it("all required icon sizes exist on disk", async () => {
    const files = [
      "icon.svg",
      "apple-touch-icon.png",
      "icon-180.png",
      "icon-192.png",
      "icon-512.png",
      "favicon.png",
    ];
    for (const f of files) {
      const info = await stat(path.join(ROOT, "static", f));
      expect(info.isFile()).toBe(true);
      expect(info.size).toBeGreaterThan(0);
    }
  });

  it("icon.svg uses the canonical house palette, not a dark tile with a line", async () => {
    const svg = await readFile(path.join(ROOT, "static", "icon.svg"), "utf8");
    expect(svg).toContain("#0b1220"); // --bg, the ground
    expect(svg).toContain("#38bdf8"); // --accent
    expect(svg).toContain("#fcd34d"); // --mark
    expect(svg).toContain("#34d399"); // --ok
    expect(svg).toContain("#fb923c"); // --warn, the piece not yet taken
    // The mark has to read at home-screen size: the type is gone, so the
    // signature is shape - four pieces inside the maskable safe zone.
    expect(svg).not.toContain("<text");
    expect(svg).toContain("<rect");
  });
});
