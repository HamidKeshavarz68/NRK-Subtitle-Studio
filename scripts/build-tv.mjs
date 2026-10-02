// Build the Samsung Tizen TV app (a standalone .wgt web app).
//
// Usage:
//   node scripts/build-tv.mjs              build → build/tv/app/
//   node scripts/build-tv.mjs --watch      rebuild on change
//   node scripts/build-tv.mjs --package    build, then sign + package with the Tizen CLI
//                                          → build/tv/NRK-Subtitle-Studio-<version>.wgt
//   node scripts/build-tv.mjs --install    package, then install + launch on the TV
//
// Options / environment:
//   --profile <name>  or TIZEN_PROFILE      Tizen Studio certificate profile to sign with
//                                           (defaults to the active profile)
//   --tv <ip>         or TV_IP              TV address for --install (sdb connect <ip>)
//   TIZEN_STUDIO                            Tizen Studio install dir (default C:\tizen-studio
//                                           or ~/tizen-studio)

import { build, context } from "esbuild";
import sharp from "sharp";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "src/tv");
const outRoot = resolve(root, "build/tv");
const out = resolve(outRoot, "app");
const APP_ID = "NrkSubStud.NRKSubtitleStudio";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, env) => {
  const i = args.indexOf(name);
  return (i !== -1 && args[i + 1]) || process.env[env] || "";
};

const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;

/** @type {import("esbuild").BuildOptions} */
const jsOptions = {
  entryPoints: { "js/app": resolve(src, "index.ts"), "css/app": resolve(src, "styles.css") },
  outdir: out,
  bundle: true,
  format: "iife",
  // Tizen 4.0 (2018 TVs) ships Chromium 56; lower all newer syntax to that.
  target: ["chrome56"],
  minify: true,
  legalComments: "none",
  logLevel: "info",
  define: { __APP_VERSION__: JSON.stringify(version) },
};

async function writeStatic() {
  mkdirSync(out, { recursive: true });
  const config = readFileSync(resolve(src, "static/config.xml"), "utf8").replace("{{VERSION}}", version);
  writeFileSync(resolve(out, "config.xml"), config);
  copyFileSync(resolve(src, "static/index.html"), resolve(out, "index.html"));
  await sharp(resolve(root, "public/icons/icon.svg"), { density: 384 })
    .resize(512, 512)
    .png()
    .toFile(resolve(out, "icon.png"));
}

function findTizenStudio() {
  const candidates = [
    process.env.TIZEN_STUDIO,
    "C:\\tizen-studio",
    join(homedir(), "tizen-studio"),
  ].filter(Boolean);
  return candidates.find((dir) => existsSync(join(dir, "tools", "ide", "bin"))) || "";
}

function tool(name) {
  const studio = findTizenStudio();
  const isWin = process.platform === "win32";
  const paths = {
    tizen: join(studio, "tools", "ide", "bin", isWin ? "tizen.bat" : "tizen"),
    sdb: join(studio, "tools", isWin ? "sdb.exe" : "sdb"),
  };
  if (studio && existsSync(paths[name])) return paths[name];
  return name; // hope it's on PATH
}

function run(cmd, cmdArgs) {
  console.log(`> ${cmd} ${cmdArgs.join(" ")}`);
  const quoted = process.platform === "win32" ? `"${cmd}"` : cmd;
  const res = spawnSync(quoted, cmdArgs.map((a) => (/\s/.test(a) ? `"${a}"` : a)), {
    stdio: "inherit",
    shell: true,
  });
  if (res.status !== 0) {
    console.error(
      `\n✖ "${cmd}" failed (exit ${res.status}).` +
        (res.error ? ` ${res.error.message}` : "") +
        "\n  Make sure Tizen Studio (with the TV extensions) is installed and a Samsung" +
        "\n  certificate profile is set up. See README → \"Samsung TV app\"."
    );
    process.exit(res.status || 1);
  }
}

function packageWgt() {
  for (const f of readdirSync(out)) if (f.endsWith(".wgt")) rmSync(join(out, f));
  const profile = option("--profile", "TIZEN_PROFILE");
  run(tool("tizen"), ["package", "-t", "wgt", ...(profile ? ["-s", profile] : []), "--", out]);
  const produced = readdirSync(out).filter((f) => f.endsWith(".wgt"))[0];
  if (!produced) {
    console.error("✖ Tizen CLI did not produce a .wgt file.");
    process.exit(1);
  }
  const wgtName = `NRK-Subtitle-Studio-${version}.wgt`;
  const dest = join(outRoot, wgtName);
  copyFileSync(join(out, produced), dest);
  rmSync(join(out, produced));
  console.log(`\n✔ Packaged ${dest} (${Math.round(statSync(dest).size / 1024)} KB)`);
  return { dir: outRoot, name: wgtName };
}

function install(wgt) {
  const ip = option("--tv", "TV_IP");
  let serialArgs = [];
  if (ip) {
    const target = ip.includes(":") ? ip : `${ip}:26101`;
    run(tool("sdb"), ["connect", target]);
    serialArgs = ["-s", target];
  }
  run(tool("tizen"), ["install", ...serialArgs, "-n", wgt.name, "--", wgt.dir]);
  run(tool("tizen"), ["run", ...serialArgs, "-p", APP_ID]);
  console.log("\n✔ Installed and launched on the TV.");
}

if (flag("--watch")) {
  await writeStatic();
  const ctx = await context(jsOptions);
  await ctx.watch();
  console.log("esbuild: watching src/tv for changes…");
} else {
  rmSync(out, { recursive: true, force: true });
  await writeStatic();
  await build(jsOptions);
  console.log(`✔ Built Tizen app v${version} → ${out}`);
  if (flag("--package") || flag("--install")) {
    const wgt = packageWgt();
    if (flag("--install")) install(wgt);
  }
}
