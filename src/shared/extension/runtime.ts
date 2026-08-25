import type { RuntimeRequest, RuntimeResponse } from "./messages";

interface RuntimeError {
  message?: string;
}

interface ExtensionManifest {
  version?: string;
}

type SendResponse = (response: RuntimeResponse) => void;

interface RuntimeMessageEvent {
  addListener(
    listener: (
      message: unknown,
      sender: unknown,
      sendResponse: SendResponse
    ) => boolean | void
  ): void;
}

export interface ExtensionRuntime {
  readonly lastError?: RuntimeError;
  readonly onMessage: RuntimeMessageEvent;
  sendMessage(request: RuntimeRequest, callback: (response: unknown) => void): void;
  getURL(path: string): string;
  getManifest(): ExtensionManifest;
}

declare const chrome: { runtime: ExtensionRuntime };

export const runtime = chrome.runtime;
