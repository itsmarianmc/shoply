"use client";
import type { ReactNode } from "react";
import { useOffline } from "@/lib/offline/client";

export default function OnlineOnly({ userId, admin = false, children }: { userId: number; admin?: boolean; children: ReactNode }) {
  const state = useOffline();
  const sameAccount = state.account?.snapshot.user.id === userId;
  if (!state.connected || state.locked || !sameAccount || (admin && state.account?.snapshot.user.role !== "ADMIN")) {
    return <div className="spl-shell"><main className="spl-main"><section className="spl-card spl-offline-start">
      <h1>Connection required</h1>
      <p role="status">{!state.ready ? "Checking your connection and account…" : "Administration and settings require a current online login. Your saved shopping list and archive are available from their own views."}</p>
      <a href="/list" className="spl-link-muted">Shopping list</a>{" · "}<a href="/archive" className="spl-link-muted">Archive</a>
    </section></main></div>;
  }
  return children;
}
