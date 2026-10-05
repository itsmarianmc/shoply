export const SHOPPING_SCAN_LANGUAGES = [
  { code: "de", name: "Deutsch" },
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
  { code: "nl", name: "Nederlands" },
  { code: "pl", name: "Polski" },
  { code: "ru", name: "Русский" },
  { code: "uk", name: "Українська" },
  { code: "tr", name: "Türkçe" },
  { code: "ar", name: "العربية" },
  { code: "hi", name: "हिन्दी" },
  { code: "bn", name: "বাংলা" },
  { code: "zh", name: "中文" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "vi", name: "Tiếng Việt" },
  { code: "id", name: "Bahasa Indonesia" },
  { code: "th", name: "ไทย" },
] as const;

export const DEFAULT_SHOPPING_SCAN_LANGUAGE = "de";

export type ShoppingScanLanguageCode = (typeof SHOPPING_SCAN_LANGUAGES)[number]["code"];

export function isShoppingScanLanguageCode(value: unknown): value is ShoppingScanLanguageCode {
  return typeof value === "string" && SHOPPING_SCAN_LANGUAGES.some((language) => language.code === value);
}

export function getShoppingScanLanguageDetails(code: ShoppingScanLanguageCode) {
  return SHOPPING_SCAN_LANGUAGES.find((language) => language.code === code)!;
}
