import type { RuntimeRequest } from "../shared/extension/messages";
import { handleRuntimeRequest } from "../shared/extension/request-handler";

/**
 * TizenBrew replacement for the extension's runtime client: there is no
 * background worker, so requests are performed directly from the page
 * (tv.nrk.no is allowed by NRK's CORS policy and Google Translate allows any
 * origin).
 */
export function requestRuntimeText(request: RuntimeRequest): Promise<string> {
  return handleRuntimeRequest(request);
}
