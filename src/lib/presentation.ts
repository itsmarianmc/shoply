const DEFAULT_CATEGORY_NAMES = new Set(["Uncategorized", "Nicht kategorisiert"]);

const UNIT_LABELS: Record<string, string> = {
  piece: "Piece",
  pack: "Pack",
  bottle: "Bottle",
  can: "Can",
  bag: "Bag",
  Stück: "Piece",
  Packung: "Pack",
  Flasche: "Bottle",
  Dose: "Can",
  Beutel: "Bag",
};

export function displayCategoryName(name: string): string {
  return DEFAULT_CATEGORY_NAMES.has(name) ? "Uncategorized" : name;
}

export function displayUnit(unit: string): string {
  return UNIT_LABELS[unit] ?? unit;
}
