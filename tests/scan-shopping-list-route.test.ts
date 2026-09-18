import { describe, expect, it, vi } from "vitest";

const scanMock = vi.hoisted(() => vi.fn());
const configurationError = vi.hoisted(() => class GeminiShoppingScanConfigurationError extends Error {});

vi.mock("@/lib/auth", () => ({ requireUser: vi.fn().mockResolvedValue({ id: 1 }) }));
vi.mock("@/lib/gemini-shopping-scan", () => ({
  GeminiShoppingScanConfigurationError: configurationError,
  scanShoppingListImage: scanMock,
}));

import { POST } from "@/app/api/scan-shopping-list/route";

function requestFor(formData: FormData) {
  return new Request("http://localhost/api/scan-shopping-list", { method: "POST", body: formData });
}

describe("POST /api/scan-shopping-list", () => {
  it("rejects an upload without an image", async () => {
    const response = await POST(requestFor(new FormData()));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please choose an image file." });
  });

  it("rejects files with unsupported media types", async () => {
    const data = new FormData();
    data.set("image", new File(["text"], "list.gif", { type: "image/gif" }));
    const response = await POST(requestFor(data));
    expect(response.status).toBe(400);
    expect(scanMock).not.toHaveBeenCalled();
  });

  it("rejects images over 10 MB", async () => {
    const data = new FormData();
    data.set("image", new File([new Uint8Array(10 * 1024 * 1024 + 1)], "list.png", { type: "image/png" }));
    const response = await POST(requestFor(data));
    expect(response.status).toBe(413);
    expect(scanMock).not.toHaveBeenCalled();
  });

  it("returns a successful, validated scan", async () => {
    scanMock.mockResolvedValueOnce({
      total_detected_lines: 1,
      successfully_parsed_count: 1,
      unreadable_count: 0,
      items: [{ name: "Milk" }],
    });
    const data = new FormData();
    data.set("image", new File(["image"], "list.webp", { type: "image/webp" }));
    const response = await POST(requestFor(data));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ items: [{ name: "Milk" }] });
  });

  it("maps Gemini errors to a small 502 response", async () => {
    scanMock.mockRejectedValueOnce(new Error("provider error"));
    const data = new FormData();
    data.set("image", new File(["image"], "list.jpeg", { type: "image/jpeg" }));
    const response = await POST(requestFor(data));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "The shopping list could not be scanned. Please try again.",
    });
  });

  it("reports a missing Gemini configuration as 503", async () => {
    scanMock.mockRejectedValueOnce(new configurationError());
    const data = new FormData();
    data.set("image", new File(["image"], "list.png", { type: "image/png" }));
    const response = await POST(requestFor(data));
    expect(response.status).toBe(503);
  });
});
