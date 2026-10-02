// Asset imports handled by esbuild loaders in scripts/build-tizenbrew.mjs.
declare module "*.css" {
  const text: string;
  export default text;
}

declare module "*.png" {
  const dataUrl: string;
  export default dataUrl;
}

/** Injected at build time from package.json. */
declare const __APP_VERSION__: string;
