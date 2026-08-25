import { settingsHost, settingsPanel } from "./elements";

let anchor: HTMLElement | null = null;

function positionSettingsHost(): void {
  if (!anchor || !anchor.isConnected) {
    settingsHost.style.left = "auto";
    settingsHost.style.top = "auto";
    settingsHost.style.right = "16px";
    settingsHost.style.bottom = "64px";
    return;
  }

  settingsHost.style.right = "auto";
  settingsHost.style.bottom = "auto";
  const anchorRect = anchor.getBoundingClientRect();
  const panelRect = settingsHost.getBoundingClientRect();
  const fontSize = parseFloat(getComputedStyle(settingsHost).fontSize);
  const gap = Number.isFinite(fontSize) ? Math.max(8, Math.round(fontSize / 2)) : 8;
  let left = anchorRect.right - panelRect.width;
  let top = anchorRect.top - panelRect.height - gap;
  if (top < gap) top = anchorRect.bottom + gap;
  left = Math.max(gap, Math.min(left, window.innerWidth - panelRect.width - gap));
  top = Math.max(gap, Math.min(top, window.innerHeight - panelRect.height - gap));
  settingsHost.style.left = `${Math.round(left)}px`;
  settingsHost.style.top = `${Math.round(top)}px`;
}

function reparentSettingsHost(): void {
  const target =
    (document.fullscreenElement as HTMLElement | null) ?? document.documentElement;
  if (settingsHost.parentElement !== target) target.appendChild(settingsHost);
}

export function isSettingsOpen(): boolean {
  return !settingsHost.hidden;
}

export function openSettings(nextAnchor?: HTMLElement | null): void {
  reparentSettingsHost();
  anchor = nextAnchor ?? null;
  settingsHost.style.visibility = "hidden";
  settingsHost.hidden = false;
  positionSettingsHost();
  settingsHost.style.visibility = "";
  anchor?.classList.add("nsr-player-btn-active");
}

export function closeSettings(): void {
  settingsHost.hidden = true;
  anchor?.classList.remove("nsr-player-btn-active");
  anchor = null;
}

export function toggleSettings(nextAnchor?: HTMLElement | null): void {
  if (isSettingsOpen()) closeSettings();
  else openSettings(nextAnchor);
}

export function syncSettingsHostParent(target: HTMLElement): void {
  if (settingsHost.parentElement !== target) target.appendChild(settingsHost);
  if (isSettingsOpen()) closeSettings();
}

export function mountSettingsPanel(): void {
  settingsPanel.hidden = false;
  settingsHost.appendChild(settingsPanel);
}

settingsPanel.addEventListener("click", (event) => event.stopPropagation());
settingsPanel.querySelector(".nsr-settings-close")?.addEventListener("click", (event) => {
  event.stopPropagation();
  closeSettings();
});
document.addEventListener("click", () => {
  if (isSettingsOpen()) closeSettings();
});
window.addEventListener("resize", () => {
  if (isSettingsOpen()) positionSettingsHost();
});
