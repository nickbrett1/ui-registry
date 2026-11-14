#!/usr/bin/env node
/**
 * CLI contract test: does `shadcn-svelte` actually install our theme?
 *
 * Six claims about this CLI were written from reading its bundle and docs and
 * all six were wrong (registry URL shape, index shape, theme install path,
 * cssVars vs files, css as object vs string, which config keys exist). Every
 * one of them was a passing unit test and a broken consumer, because the unit
 * tests asserted what we *believed* the CLI does.
 *
 * So this test does not believe anything. It pins one CLI version, runs it in
 * a throwaway project against the server we actually ship (build/ + registry/,
 * the adapter-node output, not the vitest import), and then inspects the
 * consumer's stylesheet. The expectations are derived from the frozen item the
 * registry serves, so a new theme version cannot be smuggled past it.
 *
 *   npm run test:cli          # rebuild the server, then run the contract
 *   node scripts/cli-contract.js --no-build
 *
 * Requires network the first time (npx fetches the pinned CLI; the consumer
 * project installs tailwindcss/svelte). CI runs it as its own step.
 */
import { spawn, execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";

/** The version under contract. Bump deliberately, never floating. */
const CLI = "shadcn-svelte@1.8.1";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = new Set(process.argv.slice(2));
const KEEP = args.has("--keep");
const failures = [];
const log = (...a) => console.log(...a);

function check(ok, description, detail) {
  if (ok) {
    log(`  PASS  ${description}`);
  } else {
    log(`  FAIL  ${description}${detail ? `\n        ${detail}` : ""}`);
    failures.push(description);
  }
}

function run(cmd, argv, options = {}) {
  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      argv,
      { maxBuffer: 64 * 1024 * 1024, ...options },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }),
    );
    child.on("error", (error) =>
      resolve({ code: error.code ?? 1, stdout: "", stderr: String(error.message) }),
    );
  });
}

/**
 * Run the CLI with stdin CLOSED and a hard timeout.
 *
 * Both matter, and both were learned the hard way. `add` asks a second,
 * separate question -- "Updates to your src/app.css are required. Existing CSS
 * variables may be overwritten. Continue?" -- that `--yes` does not answer.
 * Given an open stdin (Node's default pipe) the CLI waits on it forever, so a
 * bare execFile wedges CI silently; given a closed stdin it prints the prompt
 * and exits 0 having written nothing, which reads as success. Only
 * `--overwrite` answers it. A timed-out run must fail loudly instead of
 * hanging a build queue.
 */
function runCli(argv, { cwd, env, timeoutMs = 180_000 }) {
  return new Promise((resolve) => {
    const child = spawn("npx", ["--yes", CLI, ...argv], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? 124 : code, stdout, stderr, timedOut });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: String(error.message), timedOut });
    });
  });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Every published theme version, newest first, straight from the manifest. */
async function themeVersions() {
  const manifest = JSON.parse(
    await readFile(path.join(ROOT, "registry", "versions", "manifest.json"), "utf8"),
  );
  const semver = (v) => v.split(".").map(Number);
  return (manifest.items ?? [])
    .filter((item) => item.name === "theme")
    .map((item) => item.version)
    .sort((a, b) => {
      const [x, y] = [semver(a), semver(b)];
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    })
    .reverse();
}

async function startServer(workdir) {
  const serveDir = path.join(workdir, "serve");
  await mkdir(serveDir, { recursive: true });
  // The rehearsal that production runs: the adapter-node output plus the data
  // it serves, in an otherwise empty directory. Nothing from the source tree
  // gets to rescue a missing file, which is exactly the failure we want seen.
  await cp(path.join(ROOT, "build"), path.join(serveDir, "build"), { recursive: true });
  await cp(path.join(ROOT, "registry"), path.join(serveDir, "registry"), { recursive: true });
  await cp(path.join(ROOT, "registry.json"), path.join(serveDir, "registry.json"));

  const port = await freePort();
  const child = spawn(process.execPath, [path.join("build", "index.js")], {
    cwd: serveDir,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited with ${child.exitCode}:\n${output}`);
    }
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return { child, base, output: () => output };
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  child.kill("SIGKILL");
  throw new Error(`server never became healthy on ${base}:\n${output}`);
}

/**
 * The smallest project `shadcn-svelte add` accepts. Tailwind and Svelte must
 * be *installed* -- the CLI refuses a bare components.json -- and the CLI reads
 * `style` and `tailwind.css` from here, so both spellings are under test too.
 */
async function createConsumer(workdir) {
  const dir = path.join(workdir, "consumer");
  await mkdir(path.join(dir, "src"), { recursive: true });
  await writeFile(
    path.join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "cli-contract-consumer",
        private: true,
        type: "module",
        version: "0.0.0",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(dir, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          baseUrl: ".",
          paths: { $lib: ["./src/lib"], "$lib/*": ["./src/lib/*"] },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(dir, "components.json"),
    `${JSON.stringify(
      {
        style: "vega",
        tailwind: { css: "src/app.css", baseColor: "slate", cssVariables: true },
        aliases: {
          components: "$lib/components",
          utils: "$lib/utils",
          ui: "$lib/components/ui",
          hooks: "$lib/hooks",
          lib: "$lib",
        },
        typescript: true,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const importLine = '@import "tailwindcss";\n';
  await writeFile(path.join(dir, "src", "app.css"), importLine, "utf8");
  return { dir, importLine };
}

async function walk(dir, found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, found);
    else found.push(full);
  }
  return found;
}

async function main() {
  log(`CLI contract: ${CLI}\n`);

  if (!args.has("--no-build")) {
    log("building the server (vite build)...");
    const build = await run("npm", ["run", "build"], { cwd: ROOT });
    if (build.code !== 0) {
      log(build.stdout);
      log(build.stderr);
      throw new Error("build failed -- cannot test a contract against a server that will not build");
    }
  }
  if (!existsSync(path.join(ROOT, "build", "index.js"))) {
    throw new Error("build/index.js is missing; run without --no-build");
  }

  const versions = await themeVersions();
  const version = versions[0];
  log(`latest published theme: ${version}\n`);
  const item = JSON.parse(
    await readFile(path.join(ROOT, "registry", "versions", `v${version}`, "theme.json"), "utf8"),
  );

  const workdir = await mkdtemp(path.join(os.tmpdir(), "cli-contract-"));
  log(`workdir: ${workdir}\n`);
  let server;
  try {
    server = await startServer(workdir);
    log(`server: ${server.base}\n`);

    // The endpoint the CLI is pointed at is exactly the one a consumer pins.
    const indexBase = `${server.base}/r/v${version}`;
    const probe = await fetch(`${indexBase}/index.json`);
    check(probe.ok, `GET /r/v${version}/index.json -> 200`, `status ${probe.status}`);
    const index = probe.ok ? await probe.json() : [];
    check(
      Array.isArray(index),
      "index is a JSON array (the CLI parses it as one, not as {items:[]})",
      `got ${Array.isArray(index) ? "array" : typeof index}`,
    );
    check(
      index.every((entry) => typeof entry?.relativeUrl === "string"),
      "every index entry carries relativeUrl",
    );

    const { dir: consumer, importLine } = await createConsumer(workdir);
    log("\ninstalling the consumer's toolchain (tailwindcss, svelte, kit, vite)...");
    const install = await run(
      "npm",
      [
        "install",
        "--no-audit",
        "--no-fund",
        "--loglevel=error",
        "-D",
        "tailwindcss@4",
        "svelte@5",
        "@sveltejs/kit@2",
        "@sveltejs/vite-plugin-svelte@6",
        "vite@7",
      ],
      { cwd: consumer, env: { ...process.env, npm_config_update_notifier: "false" } },
    );
    if (install.code !== 0) log(install.stderr.slice(-2000));

    // Phase 1 deliberately does NOT pass --overwrite. The CLI's own contract,
    // pinned: `--yes` answers "install these components?" but not "overwrite
    // the existing CSS variables?", and with a closed stdin it exits 0 having
    // written nothing. A consumer that trusts --yes gets a green exit and no
    // theme, so the flag is part of the integration and is asserted, not
    // assumed.
    log(`\nrunning ${CLI} add theme (--yes, no --overwrite) against ${indexBase}...`);
    const cliEnv = { ...process.env, COMPONENTS_REGISTRY_URL: indexBase, NO_COLOR: "1" };
    const withoutOverwrite = await runCli(["add", "theme", "--yes", "--no-deps-install"], {
      cwd: consumer,
      env: cliEnv,
    });
    check(!withoutOverwrite.timedOut, `${CLI} does not hang on stdin when non-interactive`);
    const cssPath = path.join(consumer, "src", "app.css");
    const afterYesOnly = await readFile(cssPath, "utf8");
    check(
      afterYesOnly.trim() === importLine.trim(),
      "--yes alone does NOT install the theme (the CSS-variable overwrite confirm is a second question)",
      `stylesheet changed without --overwrite:\n${afterYesOnly.slice(0, 400)}`,
    );

    log(`\nrunning ${CLI} add theme --overwrite against ${indexBase}...`);
    const cli = await runCli(["add", "theme", "--yes", "--overwrite", "--no-deps-install"], {
      cwd: consumer,
      env: cliEnv,
    });
    log(cli.stdout.trim() ? `\n${cli.stdout.trim()}` : "");
    if (cli.code !== 0) log(cli.stderr.slice(-4000));

    check(cli.code === 0, `${CLI} add theme --overwrite exits 0`, `exit ${cli.code}`);
    check(!cli.timedOut, "the CLI completes within the timeout (no stdin wait)");

    const css = await readFile(cssPath, "utf8");
    const compact = css.replace(/\s+/g, " ");

    check(css.includes(importLine.trim()), 'keeps the consumer\'s @import "tailwindcss";');
    // Not an assertion about our item, but a consumer-facing consequence worth
    // printing: the merge adds the CLI's own stylesheet import, so a project
    // that installs the theme needs `shadcn-svelte` present at build time.
    const foreignImports = [...css.matchAll(/@import\s+"([^"]+)"/g)]
      .map((m) => m[1])
      .filter((specifier) => !specifier.startsWith(".") && specifier !== "tailwindcss");
    if (foreignImports.length > 0) {
      log(`  note  the merge imports: ${foreignImports.join(", ")} (must be a dependency of the consumer)`);
    }
    check(/@theme\s+inline/.test(css), "merges cssVars into an @theme inline block");

    // Expectations come from the frozen item, not from this file: whatever the
    // registry serves is what must land in the consumer's stylesheet.
    const missingVars = Object.entries(item.cssVars?.theme ?? {}).filter(
      ([name, value]) => !compact.includes(`${name}: ${value}`),
    );
    check(
      missingVars.length === 0,
      `all ${Object.keys(item.cssVars?.theme ?? {}).length} cssVars arrive with their values`,
      missingVars.map(([n, v]) => `missing ${n}: ${v}`).join("; "),
    );

    const selectors = Object.keys(item.css ?? {});
    const missingRules = selectors.filter((selector) => !compact.includes(selector));
    check(
      missingRules.length === 0,
      `all ${selectors.length} css rules arrive (${selectors.slice(0, 3).join(", ")}...)`,
      missingRules.map((s) => `missing selector ${s}`).join("; "),
    );

    // The regression that started this: the CLI resolves a registry:theme
    // files[].target against basename(tailwind.css) used as a *directory*, so
    // a target of src/nb-theme.css silently wrote src/app.css/src/nb-theme.css.
    check(
      !existsSync(path.join(consumer, "src", "nb-theme.css")),
      "creates no src/nb-theme.css (the theme is merged, not a second stylesheet)",
    );
    const strayDir = await readdir(path.join(consumer, "src"), { withFileTypes: true });
    check(
      !strayDir.some((entry) => entry.isDirectory() && entry.name.endsWith(".css")),
      "creates no directory named *.css in src/",
      strayDir.filter((e) => e.isDirectory()).map((e) => e.name).join(", "),
    );
    const files = await walk(consumer);
    check(
      !files.some((file) => /nb-theme/.test(file) && !file.includes("node_modules")),
      "no file anywhere in the project references nb-theme",
    );

    // A theme that half-installs is worse than one that fails: the count check
    // above would pass on a stale file, so the stylesheet must have grown.
    check(
      css.split("\n").length > 40,
      `consumer stylesheet grew (${css.split("\n").length} lines)`,
    );
  } finally {
    server?.child.kill("SIGKILL");
    if (failures.length === 0 && !KEEP) {
      await rm(workdir, { recursive: true, force: true });
    } else {
      log(`\nworkdir kept for inspection: ${workdir}`);
    }
  }

  if (failures.length > 0) {
    log(`\n${failures.length} contract failure(s):`);
    for (const failure of failures) log(`  - ${failure}`);
    process.exit(1);
  }
  log("\ncontract holds: the pinned CLI installs the theme this registry serves.");
}

main().catch((error) => {
  console.error(`\ncontract test could not run: ${error.message}`);
  process.exit(1);
});
