import { VALID_UNITS, type Unit } from "./types";

export const MAX_ITEM_NAME_LENGTH = 200;
export const MAX_NOTE_LENGTH = 500;
export const MAX_QUANTITY = 1_000_000;

export interface ValidatedItemFields {
  name: string;
  quantity: number | null;
  unit: Unit | null;
  note: string | null;
}

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function parseQuantity(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const quantity = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
    throw new Error(`Quantity must be a finite number between 0 and ${MAX_QUANTITY}.`);
  }
  return quantity;
}

export function parseUnit(value: unknown): Unit | null {
  const unit = optionalText(value);
  if (unit === null) return null;
  const normalizedUnit = {
    Stück: "piece",
    Packung: "pack",
    Flasche: "bottle",
    Dose: "can",
    Beutel: "bag",
  }[unit] ?? unit;
  if (!(VALID_UNITS as readonly string[]).includes(normalizedUnit)) {
    throw new Error("The selected unit is invalid.");
  }
  return normalizedUnit as Unit;
}

export function validateItemFields(
  name: unknown,
  fields?: { quantity?: unknown; unit?: unknown; note?: unknown }
): ValidatedItemFields {
  const trimmedName = String(name ?? "").trim();
  if (!trimmedName) throw new Error("Item name cannot be empty.");
  if (trimmedName.length > MAX_ITEM_NAME_LENGTH) {
    throw new Error(`Item name is too long (maximum ${MAX_ITEM_NAME_LENGTH} characters).`);
  }

  const note = optionalText(fields?.note);
  if (note !== null && note.length > MAX_NOTE_LENGTH) {
    throw new Error(`Note is too long (maximum ${MAX_NOTE_LENGTH} characters).`);
  }

  return {
    name: trimmedName,
    quantity: parseQuantity(fields?.quantity),
    unit: parseUnit(fields?.unit),
    note,
  };
}

export function assertPositiveSafeId(value: unknown, label = "ID"): number {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Invalid ${label}.`);
  return id;
}
