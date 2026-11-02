import { test, expect, chromium, type BrowserContext, type Page, type Route } from "@playwright/test";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const origin = "http://localhost:3107";
function database() {
  const { directory } = JSON.parse(fs.readFileSync(".npm-cache/offline-e2e-current.json", "utf8")) as { directory: string };
  const db = new Database(path.join(directory, "shoply.db")); db.pragma("journal_mode = WAL"); db.pragma("foreign_keys = ON"); return db;
}
test.beforeEach(() => {
  const db = database();
  db.exec("DELETE FROM items; DELETE FROM item_images; DELETE FROM item_history; DELETE FROM shopping_sessions;");
  db.prepare("UPDATE app_settings SET value = 'KEEP_IN_LIST' WHERE key = 'checked_item_behavior'").run();
  db.prepare("UPDATE users SET role = CASE name WHEN 'Offline Admin' THEN 'ADMIN' ELSE 'MEMBER' END").run();
  db.close();
});
async function login(page: Page, name = "Offline Admin") {
  await page.goto(`${origin}/login`);
  await page.getByLabel("Who are you?").selectOption({ label: name });
  await page.getByLabel("Password", { exact: true }).fill("offline-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "" })).toBeVisible();
  await synced(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function synced(page: Page) { await expect(page.locator(".spl-sync > [role=status]")).toHaveText("Connected · synchronized", { timeout: 30000 }); }
async function add(page: Page, name: string) {
  await page.getByPlaceholder("What do you need?").fill(name);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(page.getByRole("button", { name: `Open details for ${name}`, exact: true })).toBeVisible();
}
const row = (page: Page, name: string) => page.locator(".spl-row").filter({ has: page.getByRole("button", { name: `Open details for ${name}`, exact: true }) });
async function edit(page: Page, name: string, values: { name?: string; note?: string; quantity?: string }) {
  await page.getByRole("button", { name: `Open details for ${name}`, exact: true }).click();
  const dialog = page.getByRole("dialog");
  if (values.name !== undefined) await dialog.getByLabel("Name", { exact: true }).fill(values.name);
  if (values.quantity !== undefined) await dialog.getByLabel("Quantity", { exact: true }).fill(values.quantity);
  if (values.note !== undefined) await dialog.getByLabel("Note", { exact: true }).fill(values.note);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
}
const offlineRoute = (route: Route) => route.abort("internetdisconnected");
async function offline(context: BrowserContext, page: Page) {
  // Chromium's emulation alone can leave a restarted worker online. Cut the
  // worker-owned API requests as well, and assert the DB in mutation tests.
  await context.route("**/api/offline", offlineRoute);
  await context.setOffline(true); await expect(page.locator(".spl-sync > [role=status]")).toContainText("Offline");
}
async function reconnect(context: BrowserContext, page: Page) {
  await context.unroute("**/api/offline", offlineRoute); await context.setOffline(false);
  const details = page.locator(".spl-sync details"); if (await details.getAttribute("open") === null) await details.locator("summary").click();
  await page.getByRole("button", { name: "Retry connection" }).click();
}

test("production shell survives browser close/reopen, list/archive reload and back/forward offline", async () => {
  const profile = fs.mkdtempSync(path.join(process.cwd(), ".npm-cache", "offline-profile-"));
  let context = await chromium.launchPersistentContext(profile, { headless: true });
  let page = await context.newPage(); await login(page); await add(page, "Reopen groceries"); await synced(page);
  await row(page, "Reopen groceries").getByRole("button", { name: "Mark as checked", exact: true }).click();
  await expect(row(page, "Reopen groceries").getByRole("button", { name: "Mark as active", exact: true })).toBeVisible();
  await synced(page); await page.getByRole("button", { name: "Finish shopping" }).click(); await expect(page.locator(".spl-complete-bar")).toBeHidden(); await synced(page);
  await context.close();
  context = await chromium.launchPersistentContext(profile, { headless: true, offline: true });
  await context.route("**/api/offline", offlineRoute);
  page = await context.newPage();
  await page.goto(`${origin}/list`); await expect(page.getByPlaceholder("What do you need?")).toBeVisible();
  await page.reload(); await expect(page.getByPlaceholder("What do you need?")).toBeVisible();
  await page.getByRole("link", { name: "Archive", exact: true }).click();
  await expect(page.locator(".spl-item-name").filter({ hasText: "Reopen groceries" })).toBeVisible();
  await page.reload(); await expect(page.locator(".spl-item-name").filter({ hasText: "Reopen groceries" })).toBeVisible();
  await page.getByRole("link", { name: "Shopping list", exact: true }).click();
  await page.goBack(); await expect(page.getByRole("heading", { name: "Archive", exact: true, level: 2 })).toBeVisible();
  await page.goForward(); await expect(page.getByPlaceholder("What do you need?")).toBeVisible();
  await expect(page.locator(".spl-sync > [role=status]")).toContainText("Offline");
  await page.screenshot({ path: ".npm-cache/offline-reopened.png", fullPage: true });
  await context.close();
});

test("offline add/edit persists across reload and reaches a second client", async ({ page, context, browser }) => {
  await login(page); await offline(context, page);
  await add(page, "Offline milk"); await edit(page, "Offline milk", { name: "Offline oat milk", note: "two cartons", quantity: "2" });
  await page.reload(); await expect(row(page, "Offline oat milk")).toContainText("two cartons");
  const db = database(); expect(db.prepare("SELECT COUNT(*) AS n FROM items").get()).toEqual({ n: 0 }); db.close();
  await reconnect(context, page); await synced(page);
  const other = await browser.newContext(); const otherPage = await other.newPage(); await login(otherPage, "Offline Member");
  await expect(row(otherPage, "Offline oat milk")).toContainText("two cartons");
  await other.close();
});

for (const behavior of ["KEEP_IN_LIST", "ARCHIVE"] as const) test(`offline creation/check/edit/undo/complete identity under ${behavior}`, async ({ page, context }) => {
  const db = database(); db.prepare("UPDATE app_settings SET value = ? WHERE key = 'checked_item_behavior'").run(behavior); db.close();
  await login(page); await offline(context, page);
  await add(page, "Identity groceries"); await edit(page, "Identity groceries", { note: "before check" });
  await row(page, "Identity groceries").getByRole("button", { name: "Mark as checked", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row(page, "Identity groceries").getByRole("button", { name: "Mark as checked", exact: true })).toBeVisible();
  await row(page, "Identity groceries").getByRole("button", { name: "Mark as checked", exact: true }).click();
  await page.getByRole("button", { name: "Finish shopping" }).click();
  await expect(page.locator(".spl-complete-bar")).toBeHidden();
  await page.reload(); await page.getByRole("link", { name: "Archive", exact: true }).click();
  await expect(page.locator(".spl-item-name").filter({ hasText: "Identity groceries" })).toBeVisible();
  await reconnect(context, page); await synced(page);
  const verify = database(); const items = verify.prepare("SELECT * FROM items WHERE name = 'Identity groceries'").all() as { archived: number; shopping_completed_at: string | null; note: string }[];
  expect(items).toHaveLength(1); expect(items[0]).toMatchObject({ archived: 1, note: "before check" }); expect(items[0]?.shopping_completed_at).toBeTruthy(); verify.close();
});

test("lost committed response is retried idempotently, including quantity, check history and session", async ({ page, context }) => {
  await login(page); await add(page, "Retry groceries"); await edit(page, "Retry groceries", { quantity: "2" }); await synced(page);
  await row(page, "Retry groceries").getByRole("button", { name: "Mark as checked", exact: true }).click(); await synced(page);
  await expect(row(page, "Retry groceries").getByRole("button", { name: "Mark as active", exact: true })).toBeVisible(); await synced(page);
  await row(page, "Retry groceries").getByRole("button", { name: "Mark as active", exact: true }).click(); await synced(page);
  await expect(row(page, "Retry groceries").getByRole("button", { name: "Mark as checked", exact: true })).toBeVisible(); await synced(page);
  let dropped = 0;
  await context.route("**/api/offline", async route => {
    if (route.request().method() === "POST" && route.request().postDataJSON()?.operation && dropped < 3) {
      await route.fetch(); dropped++; await route.abort("connectionfailed");
    } else await route.continue();
  });
  await page.getByPlaceholder("What do you need?").fill("Retry groceries");
  await page.getByRole("option").filter({ hasText: "Retry groceries" }).click();
  await expect.poll(() => dropped).toBeGreaterThan(0);
  await context.unroute("**/api/offline");
  await page.getByText("Saved changes and connection", { exact: true }).click(); await page.getByRole("button", { name: "Retry connection" }).click(); await synced(page);
  await row(page, "Retry groceries").getByRole("button", { name: "Mark as checked", exact: true }).click(); await synced(page);
  const db = database();
  expect(db.prepare("SELECT quantity FROM items WHERE name = 'Retry groceries'").all()).toEqual([{ quantity: 4 }]);
  expect(db.prepare("SELECT use_count FROM item_history WHERE display_name = 'Retry groceries'").get()).toEqual({ use_count: 2 });
  expect(db.prepare("SELECT COUNT(*) AS n FROM shopping_sessions").get()).toEqual({ n: 1 }); db.close();
});

test("same-field conflicts survive reload, merge independent fields and revalidate resolution", async ({ page, context, browser }) => {
  await login(page); await add(page, "Conflict groceries"); await synced(page);
  const other = await browser.newContext(); const remote = await other.newPage(); await login(remote, "Offline Member");
  await offline(context, page); await edit(page, "Conflict groceries", { note: "local value", quantity: "3" });
  await edit(remote, "Conflict groceries", { note: "shared value" }); await synced(remote);
  await reconnect(context, page);
  await expect(page.getByRole("group", { name: "Resolve saved change" })).toContainText("shared value");
  await page.reload(); await page.getByText("Saved changes and connection", { exact: true }).click();
  await expect(page.getByRole("group", { name: "Resolve saved change" })).toContainText("local value");
  await edit(remote, "Conflict groceries", { note: "new shared value" }); await synced(remote);
  await expect.poll(() => page.evaluate(async () => {
    const key = document.cookie.split("; ").find(c => c.startsWith("shoply_account="))!.split("=")[1]!;
    return new Promise<string | undefined>(resolve => {
      const request = indexedDB.open("shoply-private-offline", 1);
      request.onsuccess = () => { const get = request.result.transaction("accounts").objectStore("accounts").get(key); get.onsuccess = () => resolve(get.result?.snapshot.items.find((i: { name: string }) => i.name === "Conflict groceries")?.note); };
    });
  })).toBe("new shared value");
  await page.getByRole("button", { name: "Apply my change to latest state" }).click();
  await expect(page.getByRole("group", { name: "Resolve saved change" })).toContainText("new shared value");
  await page.getByRole("button", { name: "Apply my change to latest state" }).click(); await synced(page);
  await expect.poll(async () => (await other.request.get(`${origin}/api/offline`)).json().then(s => s.items.find((i: { name: string }) => i.name === "Conflict groceries")?.note)).toBe("local value");
  await other.close();
});

test("deletion and completion retain offline edits and scoped completion excludes later checks", async ({ page, context, browser }) => {
  await login(page); await add(page, "Trip original"); await add(page, "Trip later"); await synced(page);
  await row(page, "Trip original").getByRole("button", { name: "Mark as checked", exact: true }).click(); await synced(page);
  const other = await browser.newContext(); const remote = await other.newPage(); await login(remote, "Offline Member");
  await offline(context, page); await page.getByRole("button", { name: "Finish shopping" }).click();
  await expect(page.locator(".spl-complete-bar")).toBeHidden();
  await row(remote, "Trip later").getByRole("button", { name: "Mark as checked", exact: true }).click(); await synced(remote);
  await reconnect(context, page); await synced(page);
  const db = database(); expect(db.prepare("SELECT shopping_completed_at FROM items WHERE name = 'Trip later'").get()).toEqual({ shopping_completed_at: null }); db.close();
  await other.close();
});

test("expired login blocks synchronization without losing the queue; same-account login recovers", async ({ page, context }) => {
  await login(page); await offline(context, page); await add(page, "Expired pending");
  const db = database(); db.exec("DELETE FROM sessions"); db.close();
  await reconnect(context, page);
  await expect(page.getByText("Sign in again to open your private shopping data. Pending changes are retained.")).toBeVisible();
  await login(page); await synced(page); await expect(row(page, "Expired pending")).toBeVisible();
});

test("multiple tabs append safely, logout requires explicit discard, next account sees no old queue", async ({ page, context }) => {
  await login(page); const second = await context.newPage(); await second.goto(`${origin}/list`); await synced(second);
  await offline(context, page);
  await Promise.all([add(page, "Tab one"), add(second, "Tab two")]);
  await expect(row(page, "Tab two")).toBeVisible();
  await page.getByRole("button", { name: "Open details for Tab one" }).click();
  const category = database(); const produce = category.prepare("SELECT id FROM categories WHERE name = 'Produce'").get() as { id: number }; category.close();
  await page.getByRole("dialog").getByRole("combobox", { name: "Category", exact: true }).selectOption(String(produce.id));
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click(); await expect(page.getByRole("dialog")).toBeHidden();
  const db = database(); db.prepare("UPDATE users SET role = 'MEMBER' WHERE name = 'Offline Admin'").run(); db.close();
  await reconnect(context, page);
  await expect(page.getByRole("group", { name: "Resolve saved change" })).toContainText("Only administrators");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("dialog")).toContainText("Some changes have not reached the server");
  await page.getByRole("button", { name: "Keep shopping", exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Discard pending changes and sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await page.getByLabel("Who are you?").selectOption({ label: "Offline Member" }); await page.getByLabel("Password", { exact: true }).fill("offline-test-password"); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await synced(page);
  await expect(page.locator(".spl-user-name")).toHaveText("Offline Member");
  await expect(second.locator(".spl-user-name")).toHaveText("Offline Member");
});

test("full local storage reports an unsaved change; offline controls and photos remain usable", async ({ page, context }) => {
  await login(page); await add(page, "Photo groceries"); await synced(page);
  const db = database(); const item = db.prepare("SELECT id FROM items WHERE name = 'Photo groceries'").get() as { id: number };
  db.close();
  const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: "green" } }).png().toBuffer();
  const uploaded = await context.request.post(`${origin}/api/item-images`, { multipart: { itemId: String(item.id), image: { name: "photo.png", mimeType: "image/png", buffer: image } } });
  expect(uploaded.ok()).toBe(true);
  await reconnect(context, page); await synced(page); await expect(page.locator(".spl-image-thumb")).toBeVisible();
  await offline(context, page); await page.reload();
  await expect(page.getByRole("img", { name: "Image for Photo groceries unavailable offline", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open details for Photo groceries" }).click();
  await expect(page.getByText("Image upload, replacement, and deletion require a connection and a synchronized item.")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".spl-scan-btn")).toBeDisabled();
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () { throw new DOMException("Simulated full storage", "QuotaExceededError"); };
  });
  await page.getByPlaceholder("What do you need?").fill("Must not appear saved"); await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(page.locator(".spl-sync > [role=status]")).toHaveText("Local save failed — change not saved");
  await expect(page.getByRole("button", { name: "Open details for Must not appear saved" })).toBeHidden();
});

test("no prior authenticated setup shows a useful fallback; caches contain only generic shell/assets", async ({ page, context }) => {
  await page.goto("/login"); await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true); await page.goto("/list");
  await expect(page.getByText("No usable shopping data is saved on this device yet. Connect and sign in to set up offline use.")).toBeVisible();
  const urls = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(r => new URL(r.url).pathname)))).flat());
  expect(urls).toContain("/offline");
  expect(urls.some(url => ["/list", "/archive", "/api/offline", "/login"].includes(url))).toBe(false);
});

test("a production worker update waits for activation and retains offline data/queue", async ({ page, context }) => {
  await login(page);
  await context.addInitScript(() => {
    const worker = navigator.serviceWorker;
    const listeners: { listener: EventListenerOrEventListenerObject | null; options?: boolean | AddEventListenerOptions }[] = [];
    const add = worker.addEventListener.bind(worker) as EventTarget["addEventListener"];
    Object.defineProperty(worker, "addEventListener", { value: (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => {
      if (type === "controllerchange") listeners.push({ listener, options });
      add(type, listener, options);
    } });
    Object.defineProperty(window, "shoplyRemoveUpdateListeners", { value: () => { for (const entry of listeners) worker.removeEventListener("controllerchange", entry.listener!, entry.options); } });
  });
  const legacy = await context.newPage(); await legacy.goto("/list"); await synced(legacy);
  // Simulate an older app that never installed a reload listener.
  await legacy.evaluate(() => (window as unknown as { shoplyRemoveUpdateListeners: () => void }).shoplyRemoveUpdateListeners());
  let legacyReloads = 0;
  legacy.on("framenavigated", frame => { if (frame === legacy.mainFrame()) legacyReloads++; });
  await offline(context, page); await add(page, "Update pending");
  const workerPath = path.join(process.cwd(), "public/sw.js"); const original = fs.readFileSync(workerPath, "utf8");
  try {
    fs.writeFileSync(workerPath, `${original}\n// offline acceptance update ${Date.now()}\n`);
    await context.route("**/api/offline", route => route.abort()); await context.setOffline(false);
    await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r?.update(); });
    await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);
    await page.reload(); await page.getByText("Saved changes and connection", { exact: true }).click();
    await page.getByRole("button", { name: "Update Shoply", exact: true }).click();
    await expect.poll(() => legacyReloads).toBeGreaterThan(0);
    await expect(row(page, "Update pending")).toBeVisible();
    await context.setOffline(true); await page.reload(); await expect(row(page, "Update pending")).toBeVisible();
  } finally { fs.writeFileSync(workerPath, original); }
});

test("two users checking the same item preserve attribution; independent field edits merge and poll through", async ({ page, context, browser }) => {
  await login(page); await add(page, "Shared check"); await add(page, "Separate fields"); await synced(page);
  const other = await browser.newContext(); const remote = await other.newPage(); await login(remote, "Offline Member");
  await offline(context, page);
  await row(page, "Shared check").getByRole("button", { name: "Mark as checked", exact: true }).click();
  await expect(row(page, "Shared check").getByRole("button", { name: "Mark as active", exact: true })).toBeVisible();
  await edit(page, "Separate fields", { note: "local independent note" });
  await row(remote, "Shared check").getByRole("button", { name: "Mark as checked", exact: true }).click();
  await expect(row(remote, "Shared check").getByRole("button", { name: "Mark as active", exact: true })).toBeVisible(); await synced(remote);
  await edit(remote, "Separate fields", { quantity: "8" }); await synced(remote);
  await reconnect(context, page); await synced(page);
  const db = database();
  expect(db.prepare("SELECT checked_by_user_id FROM items WHERE name = 'Shared check'").get()).toEqual({ checked_by_user_id: 2 });
  expect(db.prepare("SELECT use_count FROM item_history WHERE display_name = 'Shared check'").get()).toEqual({ use_count: 1 });
  expect(db.prepare("SELECT quantity, note FROM items WHERE name = 'Separate fields'").get()).toEqual({ quantity: 8, note: "local independent note" }); db.close();
  await expect(row(remote, "Separate fields")).toContainText("local independent note"); await other.close();
});

for (const remoteAction of ["delete", "complete"] as const) test(`remote ${remoteAction} retains an offline edit and dependent uncheck across reloads`, async ({ page, context, browser }) => {
  await login(page); await add(page, "Lifecycle groceries"); await synced(page);
  await row(page, "Lifecycle groceries").getByRole("button", { name: "Mark as checked", exact: true }).click();
  await expect(row(page, "Lifecycle groceries").getByRole("button", { name: "Mark as active", exact: true })).toBeVisible(); await synced(page);
  const other = await browser.newContext(); const remote = await other.newPage(); await login(remote, "Offline Member");
  await offline(context, page); await edit(page, "Lifecycle groceries", { note: "retained edit" });
  await row(page, "Lifecycle groceries").getByRole("button", { name: "Mark as active", exact: true }).click();
  await expect(row(page, "Lifecycle groceries").getByRole("button", { name: "Mark as checked", exact: true })).toBeVisible();
  if (remoteAction === "delete") {
    await remote.getByRole("button", { name: "Open details for Lifecycle groceries" }).click();
    await remote.getByRole("button", { name: "Delete item", exact: true }).click();
    await expect(remote.getByRole("dialog")).toBeHidden();
  } else { await remote.getByRole("button", { name: "Finish shopping" }).click(); await expect(remote.locator(".spl-complete-bar")).toBeHidden(); }
  await synced(remote); await reconnect(context, page);
  await expect(page.getByRole("group", { name: "Resolve saved change" })).toContainText("retained edit");
  await page.reload(); await page.locator(".spl-sync summary").click();
  await expect(page.getByRole("group", { name: "Resolve saved change" })).toContainText("retained edit");
  await page.getByRole("button", { name: "Use shared state", exact: true }).click();
  await expect(page.getByRole("group", { name: "Resolve saved change" })).toBeVisible();
  await expect(page.locator(".spl-sync ol")).toContainText("uncheck");
  const db = database();
  if (remoteAction === "delete") expect(db.prepare("SELECT COUNT(*) AS n FROM items WHERE name = 'Lifecycle groceries'").get()).toEqual({ n: 0 });
  else expect((db.prepare("SELECT shopping_completed_at FROM items WHERE name = 'Lifecycle groceries'").get() as { shopping_completed_at: string }).shopping_completed_at).toBeTruthy();
  db.close(); await other.close();
});

test("offline restoration and deletion of an unsynchronized item preserve operation identity", async ({ page, context }) => {
  await login(page); await add(page, "Restore groceries"); await synced(page);
  await row(page, "Restore groceries").getByRole("button", { name: "Mark as checked", exact: true }).click();
  await expect(row(page, "Restore groceries").getByRole("button", { name: "Mark as active", exact: true })).toBeVisible(); await synced(page);
  await page.getByRole("button", { name: "Finish shopping" }).click(); await expect(page.locator(".spl-complete-bar")).toBeHidden(); await synced(page);
  await offline(context, page); await page.getByRole("link", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: 'Restore "Restore groceries"', exact: true }).click(); await expect(page.getByRole("button", { name: 'Restore "Restore groceries"' })).toBeHidden();
  await page.getByRole("link", { name: "Shopping list", exact: true }).click(); await expect(row(page, "Restore groceries")).toBeVisible();
  await add(page, "Delete before sync"); await row(page, "Delete before sync").getByRole("button", { name: "Mark as checked", exact: true }).click();
  await expect(row(page, "Delete before sync").getByRole("button", { name: "Mark as active", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open details for Delete before sync", exact: true }).click(); await page.getByRole("button", { name: "Delete item", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden(); await page.reload(); await expect(row(page, "Delete before sync")).toBeHidden();
  await reconnect(context, page); await synced(page);
  const db = database(); expect(db.prepare("SELECT name, status, archived FROM items").all()).toEqual([{ name: "Restore groceries", status: "ACTIVE", archived: 0 }]); db.close();
});

test("unavailable IndexedDB explains that local setup/save failed instead of rendering a blank app", async ({ page, context }) => {
  await context.addInitScript(() => { indexedDB.open = () => { throw new DOMException("Device storage unavailable", "SecurityError"); }; });
  await page.goto("/login"); await page.getByLabel("Who are you?").selectOption({ label: "Offline Admin" });
  await page.getByLabel("Password", { exact: true }).fill("offline-test-password"); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".spl-sync > [role=status]")).toHaveText("Local save failed — change not saved");
  await page.locator(".spl-sync summary").click(); await expect(page.locator(".spl-sync")).toContainText("Device storage unavailable");
  await expect(page.getByRole("heading", { name: "Shoply", exact: true })).toBeVisible();
});

test("an already-open administration view becomes unavailable offline", async ({ page, context }) => {
  await login(page); await page.getByRole("link", { name: "Admin area", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await context.setOffline(true); await expect(page.getByRole("heading", { name: "Connection required", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Shopping list", exact: true }).click(); await expect(page.getByPlaceholder("What do you need?")).toBeVisible();
});

test("signing into another account after expiry isolates a retained queue, then original login recovers it", async ({ page, context }) => {
  await login(page); await offline(context, page); await add(page, "Original account pending");
  const db = database(); db.prepare("DELETE FROM sessions WHERE user_id = 1").run(); db.close();
  await reconnect(context, page); await expect(page.getByText("Sign in again to open your private shopping data. Pending changes are retained.")).toBeVisible();
  await login(page, "Offline Member"); await expect(row(page, "Original account pending")).toBeHidden();
  const queues = await page.evaluate(async () => {
    const opened = indexedDB.open("shoply-private-offline", 1);
    return new Promise<{ name: string; pending: number; locked: boolean }[]>(resolve => {
      opened.onsuccess = () => { const get = opened.result.transaction("accounts").objectStore("accounts").getAll(); get.onsuccess = () => resolve(get.result.filter(a => a?.schema === 1).map(a => ({ name: a.snapshot.user.name, pending: a.queue.length, locked: a.locked }))); };
    });
  });
  expect(queues).toContainEqual({ name: "Offline Admin", pending: 1, locked: true });
  await page.getByRole("button", { name: "Sign out" }).click(); await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await login(page); await expect(row(page, "Original account pending")).toBeVisible(); await synced(page);
});

test("offline keyboard editing, focus return, undo and category movement work with reduced motion", async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await login(page); await offline(context, page);
  await page.getByPlaceholder("What do you need?").fill("Keyboard groceries"); await page.getByPlaceholder("What do you need?").press("Enter");
  const details = page.getByRole("button", { name: "Open details for Keyboard groceries", exact: true }); await expect(details).toBeVisible();
  await details.focus(); await details.press("Enter"); await expect(page.getByRole("dialog").getByLabel("Name", { exact: true })).toBeFocused();
  await page.getByRole("dialog").getByLabel("Name", { exact: true }).press("Escape"); await expect(page.getByRole("dialog")).toBeHidden(); await expect(details).toBeFocused();
  await details.press("Enter"); await page.getByRole("dialog").getByLabel("Note", { exact: true }).fill("keyboard note");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).press("Enter"); await expect(page.getByRole("dialog")).toBeHidden();
  await row(page, "Keyboard groceries").getByRole("button", { name: "Mark as checked", exact: true }).press("Space");
  await expect(row(page, "Keyboard groceries").getByRole("button", { name: "Mark as active", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).press("Enter");
  await expect(row(page, "Keyboard groceries").getByRole("button", { name: "Mark as checked", exact: true })).toBeVisible();
  await row(page, "Keyboard groceries").getByRole("button", { name: "Move to category", exact: true }).press("Enter");
  await page.getByRole("listbox", { name: "Choose a category" }).press("ArrowDown"); await page.getByRole("option", { name: "Produce", exact: true }).press("Enter");
  await expect(page.locator("section").filter({ has: page.getByRole("heading", { name: "Produce", exact: true }) })).toContainText("Keyboard groceries");
  await page.reload(); await expect(row(page, "Keyboard groceries")).toContainText("keyboard note");
});
