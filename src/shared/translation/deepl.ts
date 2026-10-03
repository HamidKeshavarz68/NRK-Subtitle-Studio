/**
 * DeepL API helpers shared by the extension's background worker and the TV app.
 * Requests are authenticated with the `Authorization: DeepL-Auth-Key` header.
 */

/** Map our BCP-47 base codes to DeepL target languages; null = unsupported. */
export function deeplTargetLang(base: string): string | null {
  const code = (base || "").toLowerCase().split("-")[0];
  const map: Record<string, string> = {
    en: "EN-US", pt: "PT-PT", zh: "ZH", nb: "NB", no: "NB",
    ar: "AR", bg: "BG", cs: "CS", da: "DA", de: "DE", el: "EL",
    es: "ES", et: "ET", fi: "FI", fr: "FR", hu: "HU", id: "ID",
    it: "IT", ja: "JA", ko: "KO", lt: "LT", lv: "LV", nl: "NL",
    pl: "PL", ro: "RO", ru: "RU", sk: "SK", sl: "SL", sv: "SV",
    tr: "TR", uk: "UK",
  };
  return map[code] ?? null;
}

/** Free-tier keys end in ":fx" and use a separate host from Pro keys. */
export function deeplApiBase(key: string): string {
  const host = key.trim().endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
  return `https://${host}/v2`;
}

export function deeplHeaders(key: string): Record<string, string> {
  return {
    "Authorization": "DeepL-Auth-Key " + key.trim(),
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

/** Form body for /v2/translate; each text becomes its own `text` parameter. */
export function deeplTranslateBody(texts: string[], targetLang: string): string {
  const body = new URLSearchParams();
  body.set("target_lang", targetLang);
  for (const text of texts) body.append("text", text);
  return body.toString();
}

export function parseDeeplTranslations(data: unknown): string[] {
  const translations = (data as { translations?: Array<{ text?: unknown }> } | null)?.translations;
  if (!Array.isArray(translations)) throw new Error("bad DeepL response");
  return translations.map((t) => String(t?.text ?? ""));
}
