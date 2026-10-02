// Build the TizenBrew "site modification" module for Samsung (Tizen) TVs.
//
// TizenBrew opens tv.nrk.no and injects a single script into it, so this
// bundles the content script with the stylesheet and icon inlined, swaps the
// Chrome-only `platform/*` modules for the `src/tizen/*` versions, and writes a
// module package.json next to it.
//
// Usage:
//   node scripts/build-tizenbrew.mjs     → build/tizenbrew/{package.json,userScript.js}

import { build } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "build", "tizenbrew");
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

const MAIN_FILE = "userScript.js";

/** Redirect `…/platform/<name>` imports to `src/tizen/<name>.ts`. */
const tizenPlatform = {
  name: "tizen-platform",
  setup(b) {
    b.onResolve({ filter: /\/platform\/(runtime-client|extension-info)$/ }, (args) => ({
      path: resolve(root, "src", "tizen", args.path.split("/").pop() + ".ts"),
    }));
  },
};

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [resolve(root, "src/tizen/index.ts")],
  outfile: resolve(outDir, MAIN_FILE),
  bundle: true,
  format: "iife",
  // Tizen 4.0 (2018 TVs) ships Chromium 56; lower newer syntax down to it.
  target: "chrome56",
  loader: { ".css": "text", ".png": "dataurl" },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [tizenPlatform],
  legalComments: "none",
  logLevel: "info",
});

const modulePackage = {
  name: "nrk-subtitle-studio-tizenbrew",
  appName: "NRK Subtitle Studio",
  version: pkg.version,
  description:
    "Scrolling, click-to-seek and translatable NRK TV subtitles on Samsung (Tizen) TVs.",
  packageType: "mods",
  websiteURL: "https://tv.nrk.no/",
  main: MAIN_FILE,
  keys: [],
  license: pkg.license,
  repository: { url: "https://github.com/HamidKeshavarz68/NRK-Subtitle-Studio" },
};

await writeFile(
  resolve(outDir, "package.json"),
  JSON.stringify(modulePackage, null, 2) + "\n"
);

console.log(`TizenBrew module written to ${outDir}`);
