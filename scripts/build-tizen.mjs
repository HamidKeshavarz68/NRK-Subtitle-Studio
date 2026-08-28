import { build, context } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: {
    app: resolve(root, "src/tizen/app.ts"),
  },
  outdir: resolve(root, "tizen-app/dist"),
  bundle: true,
  format: "iife",
  target: "es2020",
  legalComments: "none",
  logLevel: "info",
};

const watch = process.argv.includes("--watch");

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("esbuild (tizen): watching for changes…");
} else {
  await build(options);
}
