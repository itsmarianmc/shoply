
const FALLBACK_ICON = "fa-layer-group";
const DEFAULT_ICON = "fa-cart-shopping";

const KEYWORD_ICONS: Array<{ pattern: RegExp; icon: string }> = [
  {
    pattern:
      /\b(dm|kaufland|rewe|edeka|aldi|lidl|netto|penny|hofer|spar|coop|migros|denner|globus|hittfeld)\b|\b(super)?m(ä)a(r)?rkt\b|supermarket|grocery/i,
    icon: DEFAULT_ICON,
  },
  {
    pattern: /\b(rossmann|dm\s*drogerie|drogerie|apotheke|müller)\b/i,
    icon: "fa-pump-medical",
  },
  {
    pattern: /\b(b(ae|ä)ckerei|brot|hausb(ae|)ck|metzgerei|fleisch)\b/i,
    icon: "fa-bread-slice",
  },
];

export function getCategoryIcon(name: string | null | undefined, isDefault = false): string {
  if (isDefault) return "fa-inbox";

  const normalized = (name ?? "").trim();
  if (!normalized) return FALLBACK_ICON;

  for (const { pattern, icon } of KEYWORD_ICONS) {
    if (pattern.test(normalized)) return icon;
  }
  return DEFAULT_ICON;
}
