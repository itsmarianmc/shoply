"use client";
import { useEffect, useState } from "react";
import { exportLocal, resetLocal, resolveProblem, synchronize, useOffline } from "@/lib/offline/client";
import ConfirmDialog from "./ConfirmDialog";
import { displayUnit } from "@/lib/presentation";

export default function SyncStatus() {
  const state = useOffline();
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [persistent, setPersistent] = useState<boolean | undefined>();
  const [shellReady, setShellReady] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersistent).catch(() => {});
    if (!("serviceWorker" in navigator)) return;
    let alive = true;
    const checkShell = () => {
      const worker = navigator.serviceWorker.controller;
      if (!worker) return;
      const channel = new MessageChannel();
      channel.port1.onmessage = event => { if (alive) setShellReady(event.data?.protocol === 1 && event.data?.ready === true); channel.port1.close(); };
      worker.postMessage({ type: "SHOPLY_OFFLINE_READY" }, [channel.port2]);
      setTimeout(() => channel.port1.close(), 3000);
    };
    checkShell();
    navigator.serviceWorker.addEventListener("controllerchange", checkShell);
    void navigator.serviceWorker.ready.then(checkShell);
    const check = (registration: ServiceWorkerRegistration) => {
      if (alive) setWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => registration.installing?.addEventListener("statechange", () => { if (alive) setWaiting(registration.waiting); }));
    };
    void navigator.serviceWorker.getRegistration().then(r => { if (r) check(r); });
    return () => { alive = false; navigator.serviceWorker.removeEventListener("controllerchange", checkShell); };
  }, []);
  const pending = state.account?.queue.length ?? 0;
  const problem = state.account?.queue[0]?.problem;
  const operation = state.account?.queue[0];
  const describeFields = (fields: Record<string, unknown>) => Object.entries(fields).map(([key, value]) => {
    const label = { name: "Name", quantity: "Quantity", unit: "Unit", note: "Note", category_id: "Category" }[key] ?? key;
    const readable = key === "category_id" ? state.account?.snapshot.categories.find(c => c.id === value)?.name ?? `Removed category (${value})`
      : key === "unit" && typeof value === "string" ? displayUnit(value) : value === null || value === "" ? "None" : String(value);
    return `${label}: ${readable}`;
  }).join(" · ");
  const attention = !!(state.error || problem || state.locked);
  const label = state.storageError ? "Local save failed — change not saved" : attention ? "Needs attention" : state.saving ? "Saving on this device…" : !state.connected
    ? `Offline${pending ? ` · ${pending} changes stored locally` : state.account ? " · using saved data" : " · no saved data available"}`
    : state.syncing || pending ? `Synchronizing${pending ? ` · ${pending} pending` : ""}` : "Connected · synchronized";
  async function resolve(choice: "shared" | "mine" | "separate") {
    try { await resolveProblem(choice); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save the resolution."); }
  }
  return (
    <aside className="spl-sync" aria-label="Connection and saved changes">
      <span role="status" aria-live="polite" aria-atomic="true">{label}</span>
      {state.account && <small>{shellReady ? "Offline startup ready on this device" : "Preparing offline startup — keep Shoply open online. Install any available update."}</small>}
      <details>
        <summary>Saved changes and connection</summary>
        <p>{pending} pending {pending === 1 ? "change" : "changes"}. Changes stay on this device until acknowledged by the server.</p>
        {state.error && <p role="alert">{state.error}</p>}
        {state.locked && <a className="spl-link-muted" href="/login">Sign in again to recover this account’s changes</a>}
        {!state.connected && <p>Administration, settings, AI scanning, and image changes require a connection. Item images are not stored offline.</p>}
        {persistent === false && <p>The browser may remove local storage. Device storage is not a backup.</p>}
        {problem && operation && <div className="spl-sync-problem" role="group" aria-label="Resolve saved change">
          <h3>{operation.kind === "complete" ? "Trip item not completed" : "Saved change needs review"}: {operation.base?.name ?? operation.fields?.name ?? "Item"}</h3>
          <p>{problem.message}</p>
          <p>Your intention: {operation.kind} · {describeFields(operation.patch ?? (operation.fields ? { ...operation.fields } : {}))}</p>
          <p>Shared values: {problem.item ? `${problem.item.name} · ${problem.item.shopping_completed_at ? "completed" : problem.item.status.toLowerCase()}${problem.item.archived ? " · archived" : ""} · ${describeFields({ quantity: problem.item.quantity, unit: problem.item.unit, note: problem.item.note, category_id: problem.item.category_id })}` : "Deleted or unavailable"}</p>
          <div className="spl-sync-actions">
            <button className="spl-btn spl-btn-secondary spl-btn-sm" onClick={() => void resolve("shared")}>Use shared state</button>
            {operation.kind === "add" ? <button className="spl-btn spl-btn-primary spl-btn-sm" onClick={() => void resolve("separate")}>Keep as separate item</button> : problem.item && <button className="spl-btn spl-btn-primary spl-btn-sm" onClick={() => void resolve("mine")}>Apply my change to latest state</button>}
          </div>
          <p>These choices are checked again on the server. Completed items must be restored from the archive before unchecking.</p>
        </div>}
        {pending > 0 && <ol>{state.account?.queue.map(q => <li key={q.id}>{q.kind} · {q.base?.name ?? q.fields?.name ?? "Item"}{q.trip ? " · shopping completion" : ""}{q.problem ? " · needs attention" : " · pending"}<small className="spl-sync-id">{q.id}</small></li>)}</ol>}
        <div className="spl-sync-actions">
          <button className="spl-btn spl-btn-secondary spl-btn-sm" onClick={() => void synchronize()}>Retry connection</button>
          <button disabled={state.locked} className="spl-btn spl-btn-secondary spl-btn-sm" onClick={() => void exportLocal().catch(e => setError(String(e)))}>Export local recovery file</button>
          {(state.storageError || state.locked) && <button className="spl-btn spl-btn-danger spl-btn-sm" onClick={() => setConfirmReset(true)}>Reset this device’s saved data</button>}
          {waiting && <button className="spl-btn spl-btn-primary spl-btn-sm" onClick={() => {
            const channel = new MessageChannel();
            channel.port1.onmessage = event => { if (event.data?.error) setError(String(event.data.error)); channel.port1.close(); };
            waiting.postMessage({ type: "SHOPLY_ACTIVATE_UPDATE" }, [channel.port2]);
            setTimeout(() => channel.port1.close(), 15000);
          }}>Update Shoply</button>}
        </div>
        {error && <p role="alert">{error}</p>}
      </details>
      {confirmReset && <ConfirmDialog title="Discard this device’s saved data?" cancelLabel="Keep saved data" message="This permanently removes this account’s local snapshot and all unsynchronized changes on this device. Export a recovery file first if possible. The shared server data is kept." confirmLabel="Discard local data" onCancel={() => setConfirmReset(false)} onConfirm={() => { setConfirmReset(false); void resetLocal().catch(e => setError(String(e))); }} />}
    </aside>
  );
}
