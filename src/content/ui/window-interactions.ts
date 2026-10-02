import { STORAGE_KEYS, WINDOW_MIN } from "../core/config";
import { readStorage, writeStorage } from "../core/utils";

interface SavedSize {
  width: number;
  height: number;
}

const SIZE_MIN_THRESHOLD = { width: 400, height: 500 } as const;

function loadSize(): SavedSize | null {
  const raw = readStorage(STORAGE_KEYS.size);
  if (!raw) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (
      typeof record.w !== "number" ||
      typeof record.h !== "number" ||
      record.w < SIZE_MIN_THRESHOLD.width ||
      record.h < SIZE_MIN_THRESHOLD.height
    ) {
      return null;
    }
    return { width: record.w, height: record.h };
  } catch {
    return null;
  }
}

function restoreSize(element: HTMLElement): void {
  const savedSize = loadSize();
  if (!savedSize) return;
  element.style.width = `${savedSize.width}px`;
  element.style.height = `${savedSize.height}px`;
}

function persistSize(element: HTMLElement): void {
  let saveTimer: number | null = null;
  const observer = new ResizeObserver(() => {
    if (saveTimer !== null) return;
    saveTimer = self.setTimeout(() => {
      saveTimer = null;
      const rect = element.getBoundingClientRect();
      writeStorage(STORAGE_KEYS.size, JSON.stringify({
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      }));
    }, 150);
  });
  observer.observe(element);
}

function makeResizable(element: HTMLElement): void {
  element.querySelectorAll<HTMLElement>(".nsr-rh").forEach((handle) => {
    handle.addEventListener("pointerdown", (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const direction = handle.dataset.dir || "";
      const start = element.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      const maxWidth = Math.min(window.innerWidth * 0.95, window.innerWidth - 4);
      const maxHeight = Math.min(window.innerHeight * 0.95, window.innerHeight - 4);

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;
        let left = start.left;
        let top = start.top;
        let width = start.width;
        let height = start.height;

        if (direction.includes("e")) width = start.width + deltaX;
        if (direction.includes("s")) height = start.height + deltaY;
        if (direction.includes("w")) {
          width = start.width - deltaX;
          left = start.left + deltaX;
        }
        if (direction.includes("n")) {
          height = start.height - deltaY;
          top = start.top + deltaY;
        }

        if (width < WINDOW_MIN.width) {
          if (direction.includes("w")) left -= WINDOW_MIN.width - width;
          width = WINDOW_MIN.width;
        }
        if (width > maxWidth) {
          if (direction.includes("w")) left += width - maxWidth;
          width = maxWidth;
        }
        if (height < WINDOW_MIN.height) {
          if (direction.includes("n")) top -= WINDOW_MIN.height - height;
          height = WINDOW_MIN.height;
        }
        if (height > maxHeight) {
          if (direction.includes("n")) top += height - maxHeight;
          height = maxHeight;
        }

        if (left < 0) {
          width += left;
          left = 0;
        }
        if (top < 0) {
          height += top;
          top = 0;
        }
        if (left + width > window.innerWidth) width = window.innerWidth - left;
        if (top + height > window.innerHeight) height = window.innerHeight - top;

        element.style.right = "auto";
        element.style.bottom = "auto";
        element.style.left = `${left}px`;
        element.style.top = `${top}px`;
        element.style.width = `${width}px`;
        element.style.height = `${height}px`;
      };

      const onEnd = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onEnd);
        handle.removeEventListener("pointercancel", onEnd);
      };

      try {
        handle.setPointerCapture(pointerId);
      } catch {
        // Pointer capture is optional; document-level movement still works.
      }
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onEnd);
      handle.addEventListener("pointercancel", onEnd);
    });
  });
}

function makeDraggable(element: HTMLElement, handle: HTMLElement): void {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  let pointerId = -1;

  handle.addEventListener("pointerdown", (event: PointerEvent) => {
    const tag = (event.target as HTMLElement).tagName;
    if (tag === "BUTTON" || tag === "SELECT" || tag === "OPTION") return;
    dragging = true;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    const rect = element.getBoundingClientRect();
    originX = rect.left;
    originY = rect.top;
    element.style.right = "auto";
    element.style.bottom = "auto";
    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // Pointer capture is optional; dragging still works while over the handle.
    }
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event: PointerEvent) => {
    if (!dragging || event.pointerId !== pointerId) return;
    element.style.left = `${Math.max(0, originX + event.clientX - startX)}px`;
    element.style.top = `${Math.max(0, originY + event.clientY - startY)}px`;
  });

  const end = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = -1;
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}

export function initializeOverlayWindow(
  element: HTMLElement,
  dragHandle: HTMLElement
): void {
  restoreSize(element);
  persistSize(element);
  makeResizable(element);
  makeDraggable(element, dragHandle);
}
