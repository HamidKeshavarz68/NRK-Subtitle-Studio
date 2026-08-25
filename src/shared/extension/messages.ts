export type TranslatorProvider = "google" | "deepl";

export interface TranslateRequest {
  type: "translate";
  text: string;
  source: string;
  target: string;
  provider: TranslatorProvider;
  apiKey?: string;
}

export interface NrkFetchRequest {
  type: "nrk-fetch";
  url: string;
}

export type RuntimeRequest = TranslateRequest | NrkFetchRequest;

export type RuntimeResponse =
  | { ok: true; text: string }
  | { ok: false; error: string };

export function isRuntimeResponse(value: unknown): value is RuntimeResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return response.ok === true
    ? typeof response.text === "string"
    : response.ok === false && typeof response.error === "string";
}
