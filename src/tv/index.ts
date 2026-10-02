/** Entry point of the Samsung Tizen TV app. */

import { startApp } from "./app";
import { registerTvKeys } from "./keys";
import { createHome } from "./screens/home";

function boot(): void {
  registerTvKeys();
  const root = document.getElementById("app");
  if (!root) return;
  startApp(root, createHome());
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
