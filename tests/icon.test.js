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
    expect(html).toContain('name="theme-color" content="#0f172a"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
  });

  it("static/ manifest carries house styling and icon entries", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(ROOT, "static", "manifest.webmanifest"), "utf8"),
    );
    expect(manifest.background_color).toBe("#0f172a");
    expect(manifest.theme_color).toBe("#0f172a");
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

  it("icon.svg uses the canonical house tokens (ground + accent + cream)", async () => {
    const svg = await readFile(path.join(ROOT, "static", "icon.svg"), "utf8");
    expect(svg).toContain("#0f172a"); // --bg
    expect(svg).toContain("#7dd3fc"); // --accent
    expect(svg).toContain("#fce4b8"); // --mark (the one warm note)
  });
});
