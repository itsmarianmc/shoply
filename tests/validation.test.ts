import { describe, expect, it } from "vitest";
import { parseQuantity, parseUnit, validateItemFields, MAX_QUANTITY } from "@/lib/validation";

describe("item validation", () => {
  it("normalizes empty optional values", () => {
    expect(validateItemFields("  Milk ", { quantity: "", unit: "", note: " " })).toMatchObject({
      name: "Milk", quantity: null, unit: null, note: null,
    });
  });

  it("accepts valid quantities and units", () => {
    expect(parseQuantity("2.5")).toBe(2.5);
    expect(parseUnit("kg")).toBe("kg");
  });

  it.each(["NaN", "Infinity", "-1", "0", String(MAX_QUANTITY + 1)])(
    "rejects invalid quantity %s",
    (value) => expect(() => parseQuantity(value)).toThrow("Quantity")
  );

  it("rejects unknown units and overly long notes", () => {
    expect(() => parseUnit("liter")).toThrow("unit");
    expect(() => validateItemFields("Bread", { note: "x".repeat(501) })).toThrow("Note");
  });
});
