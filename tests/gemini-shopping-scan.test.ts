import { describe, expect, it } from "vitest";
import {
  GeminiShoppingScanResponseError,
  validateShoppingScanResult,
} from "@/lib/gemini-shopping-scan";

const validResult = {
  total_detected_lines: 3,
  successfully_parsed_count: 2,
  unreadable_count: 1,
  items: [{ name: "  Milk " }, { name: "Bread" }],
};

describe("Gemini shopping scan response validation", () => {
  it("accepts a valid response and trims item names", () => {
    expect(validateShoppingScanResult(validResult)).toEqual({
      total_detected_lines: 3,
      successfully_parsed_count: 2,
      unreadable_count: 1,
      items: [{ name: "Milk" }, { name: "Bread" }],
    });
  });

  it.each([
    ["missing required property", { ...validResult, items: undefined }],
    ["negative counter", { ...validResult, unreadable_count: -1 }],
    ["fractional counter", { ...validResult, total_detected_lines: 2.5 }],
    ["wrong successful count", { ...validResult, successfully_parsed_count: 1 }],
    ["wrong unreadable count", { ...validResult, unreadable_count: 0 }],
    ["empty item name", { ...validResult, items: [{ name: " " }, { name: "Bread" }] }],
    ["too-long item name", { ...validResult, items: [{ name: "x".repeat(201) }, { name: "Bread" }] }],
    ["unknown top-level property", { ...validResult, extra: true }],
  ])("rejects %s", (_label, response) => {
    expect(() => validateShoppingScanResult(response)).toThrow(GeminiShoppingScanResponseError);
  });
});
