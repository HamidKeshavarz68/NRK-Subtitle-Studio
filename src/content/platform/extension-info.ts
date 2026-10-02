import { runtime } from "../../shared/extension/runtime";

/** The extension's own icon (declared in web_accessible_resources). */
export const ICON_URL = (() => {
  try {
    return runtime.getURL("public/icons/icon-128.png");
  } catch {
    return "";
  }
})();

export const VERSION = (() => {
  try {
    return runtime.getManifest().version || "";
  } catch {
    return "";
  }
})();
