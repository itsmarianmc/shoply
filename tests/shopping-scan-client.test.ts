import { describe, expect, it, vi } from "vitest";
import { confirmScannedItem } from "@/lib/shopping-scan-client";

describe("scanned-item confirmation", () => {
  it("calls the existing add-item action with the scanned name", async () => {
    const addItemAction = vi.fn().mockResolvedValue({ success: true });
    await expect(confirmScannedItem(addItemAction, "Tomatoes")).resolves.toEqual({ success: true });
    expect(addItemAction).toHaveBeenCalledOnce();
    expect(addItemAction.mock.calls[0]?.[0].get("name")).toBe("Tomatoes");
  });
});
