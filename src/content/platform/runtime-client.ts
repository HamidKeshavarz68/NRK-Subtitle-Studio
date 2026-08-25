import { isRuntimeResponse, RuntimeRequest } from "../../shared/extension/messages";
import { runtime } from "../../shared/extension/runtime";

/** Send a typed request to the service worker and return its text payload. */
export function requestRuntimeText(request: RuntimeRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      runtime.sendMessage(request, (response: unknown) => {
        const runtimeError = runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || "runtime error"));
          return;
        }
        if (!isRuntimeResponse(response)) {
          reject(new Error("invalid runtime response"));
          return;
        }
        if (!response.ok) {
          reject(new Error(response.error));
          return;
        }
        resolve(response.text);
      });
    } catch (error: unknown) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
