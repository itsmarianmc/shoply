"use client";

import { useSyncExternalStore } from "react";
import { changeAccount, lease, rawAccount, readAccount, removeAccount } from "./storage";
import { appendOperation, freshAccount, visibleItems } from "./model";
import { validateItemFields } from "../validation";
import { newId } from "./id";
import { EDIT_FIELDS, type LocalAccount, type Operation, type QueuedOperation, type Receipt, type Snapshot, type SyncItem } from "./types";

interface View {
  account?: LocalAccount;
  ready: boolean;
  connected: boolean;
  syncing: boolean;
  saving: number;
  error?: string;
  storageError?: boolean;
  locked?: boolean;
}
const empty: View = { ready: false, connected: false, syncing: false, saving: 0 };
let view = empty;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | undefined;
let running = false;
let started = false;
let failures = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let epoch = 0;
let lastReachableAt = 0;
const queuedAt = new Map<string, number>();
const owner = typeof crypto !== "undefined" ? newId() : "server";

export const accountCookie = () => typeof document === "undefined" ? "" : document.cookie.split("; ").find(c => c.startsWith("shoply_account="))?.slice("shoply_account=".length) ?? "";
const emit = (patch: Partial<View>) => {
  if (patch.account && view.account?.snapshot.accountKey === patch.account.snapshot.accountKey &&
    (view.account.localRevision ?? 0) > (patch.account.localRevision ?? 0)) patch = { ...patch, account: view.account };
  view = { ...view, ...patch }; for (const listener of listeners) listener();
};
export function useOffline() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => view, () => empty);
}

async function load() {
  const key = accountCookie();
  if (!key) { emit({ account: undefined, ready: true, locked: false }); return; }
  try {
    const account = await readAccount(key);
    if (accountCookie() !== key) return;
    if (account && view.account?.snapshot.accountKey === key && (account.localRevision ?? 0) < (view.account.localRevision ?? 0)) return;
    if (!account && view.account?.snapshot.accountKey === key && view.account.queue.length) throw new Error("The browser removed local storage while changes were pending. Export the remaining in-memory recovery reference before reloading.");
    emit({ account: account?.locked ? undefined : account, ready: true, locked: account?.locked });
  } catch (error) { localFailure(error); }
}

function localFailure(error: unknown): never {
  const detail = error instanceof Error ? error.message : "Local storage failed.";
  emit({ ready: true, storageError: true, error: `Not saved locally. ${detail} Keep this screen open and free device storage, then retry.` });
  throw error;
}

function announce() { channel?.postMessage("changed"); }
async function commit(change: (account: LocalAccount) => void) {
  const key = accountCookie();
  if (!key || view.locked) throw new Error("Sign in to this account before making changes.");
  emit({ saving: view.saving + 1 });
  try {
    const account = await changeAccount(key, current => {
      if (!current || current.locked) throw new Error("Open Shoply online and sign in before saving changes.");
      change(current);
      return current;
    });
    if (accountCookie() !== key) { await load(); throw new Error("The account changed. Your work stays with its original account."); }
    emit({ account, storageError: false, error: undefined }); announce();
    void navigator.storage?.persist?.().catch(() => false);
    schedule(25);
  } catch (error) { localFailure(error); }
  finally { emit({ saving: Math.max(0, view.saving - 1) }); }
}

function find(account: LocalAccount, id: number): SyncItem {
  const item = visibleItems(account).find(i => i.id === id);
  if (!item) throw new Error("This item is no longer in the saved view.");
  return item;
}

export async function addLocal(form: FormData): Promise<{ success?: boolean; error?: string }> {
  const fields = validateItemFields(form.get("name"), { quantity: form.get("quantity"), unit: form.get("unit"), note: form.get("note") });
  const explicitQuantity = fields.quantity;
  await commit(account => {
    const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
    const history = account.snapshot.history.find(h => normalize(h.display_name) === normalize(fields.name));
    const categoryId = account.snapshot.user.role === "ADMIN" && history?.category_id && account.snapshot.categories.some(c => c.id === history.category_id)
      ? history.category_id : account.snapshot.categories.find(c => c.is_default)!.id;
    fields.quantity ??= history?.default_quantity ?? null;
    fields.unit = fields.unit ?? validateItemFields("valid", { unit: history?.default_unit }).unit;
    const candidate = explicitQuantity === null ? undefined : visibleItems(account).find(i => (i.id > 0 || account.links[i.key]) && !i.pendingFrom && i.status === "ACTIVE" && !i.archived && i.category_id === categoryId &&
      normalize(i.name) === normalize(fields.name) && i.quantity !== null && fields.quantity !== null &&
      i.quantity + fields.quantity <= 1_000_000 && i.unit === fields.unit && i.note === fields.note && !account.queue.some(q => q.target === i.key));
    const duplicate = candidate ? { ...candidate, id: account.links[candidate.key] ?? candidate.id } : undefined;
    const target = `c:${newId()}`;
    account.localIds[target] = candidate?.id ?? account.nextId--;
    const op: Operation = { id: newId(), kind: "add", target, base: null, fields, categoryId,
      delayed: !view.connected || !navigator.onLine, ...(duplicate ? { duplicate } : {}) };
    queuedAt.set(op.id, Date.now());
    account.queue.push(op);
  });
  return { success: true };
}

export async function mutateLocal(id: number, kind: Operation["kind"], extra: Partial<Operation> = {}): Promise<boolean> {
  await commit(account => {
    const item = find(account, id);
    if (kind === "edit" && extra.patch?.name !== undefined && account.snapshot.user.role !== "ADMIN" && item.added_by_user_id !== account.snapshot.user.id) throw new Error("You can only rename items you added.");
    if (kind === "edit" && extra.patch?.category_id !== undefined && account.snapshot.user.role !== "ADMIN") throw new Error("Only administrators may move items.");
    if (kind === "delete" && item.status !== "CHECKED" && !item.archived) throw new Error("Only checked or archived items can be deleted.");
    const op = appendOperation(account, kind, item, { delayed: !view.connected || !navigator.onLine, ...extra });
    queuedAt.set(op.id, Date.now());
  });
  return true;
}

export async function completeLocal(): Promise<number> {
  let count = 0;
  await commit(account => {
    const trip = newId();
    for (const item of visibleItems(account).filter(i => i.status === "CHECKED" && !i.shopping_completed_at)) {
      appendOperation(account, "complete", item, { trip }); count++;
    }
  });
  return count;
}

function schedule(ms?: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void synchronize(); }, ms ?? (failures ? Math.min(60000, 2000 * 2 ** Math.min(failures, 5)) + Math.random() * 1000 : 5000));
}

async function request(init?: RequestInit): Promise<Response> {
  // POST also avoids the generic GET caches of pre-offline Shoply workers
  // during their update/waiting period.
  return fetch("/api/offline", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(12000),
    method: "POST", headers: { "content-type": "application/json", "x-shoply-sync": "1" }, body: JSON.stringify({ protocol: 1, mode: "snapshot" }), ...init });
}

async function lockAccount(key: string, message: string) {
  if (key) await changeAccount(key, current => { if (current) current.locked = true; return current; }).catch(localFailure);
  emit({ account: undefined, locked: true, connected: true, error: message }); announce();
}

async function exchange(runEpoch: number) {
  const initialKey = accountCookie();
  const response = await request();
  if (runEpoch !== epoch) return;
  if (response.status === 401) { await lockAccount(initialKey, "Your login expired or access was revoked. Sign in to the same account to recover pending changes."); return; }
  if (!response.ok) throw new Error("The server is not reachable.");
  const snapshot = await response.json() as Snapshot;
  if (snapshot.protocol !== 1 || !snapshot.accountKey || !Array.isArray(snapshot.items)) {
    emit({ error: "This server uses a different sync protocol. Update Shoply; pending work is retained.", connected: true }); return;
  }
  const key = snapshot.accountKey;
  if (runEpoch !== epoch || accountCookie() !== initialKey) return;
  // Existing sessions established before offline support have no selector.
  // Set it only if the account did not change while this request was in flight.
  if (accountCookie() !== key) document.cookie = `shoply_account=${key}; Path=/; Max-Age=${30 * 86400}; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
  if (initialKey && initialKey !== key) {
    await changeAccount(initialKey, current => { if (current) current.locked = true; return current; });
    emit({ account: undefined });
  }
  const account = await changeAccount(key, current => {
    if (!current && view.account?.snapshot.accountKey === key && view.account.queue.length) throw new Error("The browser removed pending local data. Export the in-memory recovery reference before resetting this device.");
    const next = current ?? freshAccount(snapshot);
    next.snapshot = snapshot; next.locked = false;
    for (const [ref, id] of Object.entries(snapshot.links)) if (next.localIds[ref]) next.links[ref] = id;
    return next;
  }).catch(localFailure);
  lastReachableAt = Date.now(); failures = 0;
  if (accountCookie() !== key) return;
  emit({ account, ready: true, connected: true, locked: false, error: undefined, storageError: false }); announce();
  let changed = false;
  for (let n = 0; n < 50 && runEpoch === epoch && accountCookie() === key; n++) {
    await lease("global", owner);
    const current = await readAccount(key).catch(localFailure);
    const queued = current?.queue[0];
    if (!queued || queued.problem || current?.locked) break;
    const { problem: _problem, ...operation } = queued;
    const result = await request({ method: "POST", headers: { "content-type": "application/json", "x-shoply-sync": "1" },
      body: JSON.stringify({ protocol: 1, accountKey: key, operation,
        live: !operation.delayed && Date.now() - (queuedAt.get(operation.id) ?? 0) < 15000 }) });
    if (runEpoch !== epoch) return;
    if (result.status === 401 || result.status === 403) { await lockAccount(key, "Sign in to the original account before synchronizing. Your pending changes are retained."); return; }
    if (result.status >= 500) throw new Error("The server could not synchronize yet.");
    const data = await result.json() as { receipt?: Receipt; error?: string; currentItem?: SyncItem | null };
    const receipt = data.receipt ?? { outcome: "blocked", message: data.error ?? "Update Shoply and retry.", item: null } as Receipt;
    const updated = await changeAccount(key, local => {
      if (!local) throw new Error("Local storage was removed during synchronization.");
      const index = local.queue.findIndex(q => q.id === operation.id);
      if (index < 0) return local;
      if (receipt.outcome !== "applied") local.queue[index]!.problem = receipt;
      else {
        changed = true;
        local.queue.splice(index, 1);
        if (operation.target.startsWith("c:") && receipt.serverId) local.links[operation.target] = receipt.serverId;
        const serverId = receipt.serverId ?? (operation.target.startsWith("s:") ? Number(operation.target.slice(2)) : undefined);
        const currentItem = "currentItem" in data ? data.currentItem : receipt.item;
        const saved = local.snapshot.items.find(i => i.id === serverId);
        if (serverId && (!currentItem || !saved || currentItem.versions.version >= saved.versions.version)) {
          local.snapshot.items = local.snapshot.items.filter(i => i.id !== serverId);
          if (currentItem) local.snapshot.items.push(currentItem);
        }
      }
      return local;
    }).catch(localFailure);
    if (accountCookie() === key) emit({ account: updated }); announce();
    if (receipt.outcome !== "applied") break;
  }
  if (changed && runEpoch === epoch && accountCookie() === key) {
    const refreshed = await request();
    if (refreshed.status === 401) { await lockAccount(key, "Sign in again to recover this account's pending changes."); return; }
    if (!refreshed.ok) throw new Error("Could not refresh shared shopping data.");
    const latest = await refreshed.json() as Snapshot;
    if (latest.protocol !== 1 || latest.accountKey !== key || accountCookie() !== key || runEpoch !== epoch) return;
    const updated = await changeAccount(key, current => {
      if (!current) throw new Error("Local storage was removed during synchronization.");
      current.snapshot = latest;
      for (const [ref, id] of Object.entries(latest.links)) if (current.localIds[ref]) current.links[ref] = id;
      return current;
    }).catch(localFailure);
    if (accountCookie() === key) emit({ account: updated }); announce();
  }
}

export async function synchronize() {
  if (running) return;
  running = true;
  const runEpoch = epoch;
  emit({ syncing: true });
  try {
    if (navigator.locks) await navigator.locks.request("shoply-sync", { ifAvailable: true }, async lock => { if (lock) await exchange(runEpoch); else await load(); });
    else if (await lease("global", owner)) { try { await exchange(runEpoch); } finally { await lease("global", owner, true); } }
  } catch (error) {
    failures++;
    if (error instanceof DOMException && ["QuotaExceededError", "InvalidStateError", "UnknownError", "VersionError"].includes(error.name)) {
      try { localFailure(error); } catch { /* status retains failure */ }
    } else emit({ connected: false, ready: true });
  } finally {
    running = false; emit({ syncing: false }); schedule();
  }
}

export function startOffline() {
  if (started) return;
  started = true;
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("shoply-private-state");
    channel.onmessage = () => { void load().catch(() => {}); };
  }
  const wake = () => {
    const key = accountCookie();
    if (view.account?.snapshot.accountKey !== key) emit({ account: undefined });
    void load().catch(() => {}); schedule(0);
  };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") wake(); });
  window.addEventListener("pageshow", wake);
  window.addEventListener("online", wake);
  window.addEventListener("offline", () => { emit({ connected: false }); schedule(0); });
  void load().catch(() => {}).finally(() => schedule(0));
}

export async function resolveProblem(choice: "shared" | "mine" | "separate") {
  await commit(account => {
    const old = account.queue[0];
    if (!old?.problem) return;
    // Bind the choice to the shared values actually shown for review. A newer
    // background snapshot must never silently loosen this precondition.
    const latest = old.problem.item;
    if (choice === "mine" && old.kind !== "add" && !latest) throw new Error("A deleted item cannot be recreated by resolving an edit. Use the shared state or keep this intention for reference.");
    const replacement: QueuedOperation = { ...old, id: newId(), base: latest, delayed: true };
    delete replacement.problem; delete replacement.baseFrom;
    if (choice === "shared") {
      replacement.kind = "accept";
      if (old.kind === "add" && latest) { replacement.adoptId = latest.id; account.links[old.target] = latest.id; }
    } else if (old.kind === "add") {
      delete replacement.duplicate; // Explicit choice to keep a separate item.
    }
    account.queue[0] = replacement;
    for (const dependent of account.queue.slice(1)) if (dependent.baseFrom === old.id) dependent.baseFrom = replacement.id;
  });
}

export async function exportLocal(): Promise<void> {
  if (view.locked) throw new Error("Sign in to the original account before exporting its private data.");
  const key = accountCookie();
  if (!key) return;
  const data = await rawAccount(key) ?? (view.account?.snapshot.accountKey === key ? view.account : undefined);
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "shoply-local-recovery.json"; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function pendingCount(): Promise<number> {
  const key = accountCookie();
  return key ? (await readAccount(key))?.queue.length ?? 0 : 0;
}

export async function clearForLogout(discard: boolean, logout: () => Promise<void>): Promise<void> {
  const key = accountCookie();
  const clear = async () => {
    if (accountCookie() !== key) throw new Error("The account changed while waiting. Review the current account before signing out.");
    epoch++;
    if (key) {
      const account = await readAccount(key);
      if (!discard && account?.queue.length) throw new Error("Synchronize or explicitly discard pending changes before signing out.");
      await removeAccount(key);
    }
    document.cookie = "shoply_account=; Max-Age=0; Path=/; SameSite=Strict";
    emit({ account: undefined, locked: true }); announce();
    await logout();
  };
  if (navigator.locks) await navigator.locks.request("shoply-sync", clear);
  else { if (!await lease("global", owner)) throw new Error("Another window is synchronizing. Try again shortly."); try { await clear(); } finally { await lease("global", owner, true); } }
}

export async function resetLocal(): Promise<void> {
  const key = accountCookie();
  const reset = async () => {
    if (accountCookie() !== key) throw new Error("The account changed. Open its saved-data controls again.");
    epoch++; if (key) await removeAccount(key);
    emit({ account: undefined, locked: false, storageError: false, error: undefined }); announce(); schedule(0);
  };
  if (navigator.locks) await navigator.locks.request("shoply-sync", reset);
  else { if (!await lease("global", owner)) throw new Error("Another window is synchronizing. Try again shortly."); try { await reset(); } finally { await lease("global", owner, true); } }
}

export function onlineAvailable() { return view.connected && navigator.onLine && Date.now() - lastReachableAt < 30000 && !view.locked; }
export function localSuggestions(prefix: string) {
  return view.account?.snapshot.history.filter(h => h.display_name.toLowerCase().startsWith(prefix.trim().toLowerCase())).slice(0, 8) ?? [];
}

export async function editLocal(form: FormData, baseline?: SyncItem): Promise<{ success?: boolean; error?: string }> {
  const id = Number(form.get("itemId"));
  const fields = validateItemFields(form.has("name") ? form.get("name") : "valid", { quantity: form.get("quantity"), unit: form.get("unit"), note: form.get("note") });
  await commit(account => {
    const item = baseline ?? find(account, id);
    const proposed = { quantity: fields.quantity, unit: fields.unit, note: fields.note,
      ...(form.has("name") ? { name: fields.name } : {}), ...(form.has("categoryId") ? { category_id: Number(form.get("categoryId")) } : {}) };
    const patch: Operation["patch"] = {};
    for (const field of EDIT_FIELDS) if (field in proposed && proposed[field as keyof typeof proposed] !== item[field]) Object.assign(patch, { [field]: proposed[field as keyof typeof proposed] });
    if (Object.keys(patch).length) appendOperation(account, "edit", item, { patch });
  });
  return { success: true };
}

export function serverIdFor(id: number): number | undefined {
  if (id > 0) return id;
  const account = view.account;
  const key = account && Object.keys(account.localIds).find(ref => account.localIds[ref] === id);
  return key ? account?.links[key] : undefined;
}
