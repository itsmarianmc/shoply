"use client";

import { useEffect, useState } from "react";
import { useOffline } from "@/lib/offline/client";
import { visibleItems } from "@/lib/offline/model";
import Header from "./Header";
import SyncStatus from "./SyncStatus";
import AddItemForm from "./AddItemForm";
import CategorySection from "./CategorySection";
import CompleteShoppingBar from "./CompleteShoppingBar";
import UndoSnackbarArea from "./UndoSnackbarArea";
import ArchiveRow from "./ArchiveRow";
import PullToRefresh from "./PullToRefresh";

export default function ShoppingApp({ initialView = "list" }: { initialView?: "list" | "archive" | "fallback" }) {
  const state = useOffline();
  const [page, setPage] = useState(initialView);
  useEffect(() => {
    const update = () => setPage(location.pathname === "/archive" ? "archive" : ["/list", "/", "/offline"].includes(location.pathname) ? "list" : "fallback");
    update(); window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  function navigate(event: React.MouseEvent<HTMLAnchorElement>, target: "list" | "archive") {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); history.pushState(null, "", `/${target}`); setPage(target);
    window.scrollTo(0, 0); document.getElementById("shopping-title")?.focus();
  }
  const account = state.account;
  if (!account) return <div className="spl-shell">
    <main className="spl-main"><section className="spl-card spl-offline-start">
      <h1>Shoply</h1><p role="status">{!state.ready ? "Opening saved shopping data…" : state.locked ? "Sign in again to open your private shopping data. Pending changes are retained." : "No usable shopping data is saved on this device yet. Connect and sign in to set up offline use."}</p>
      <a className="spl-link-muted" href="/login">Sign in online</a>
    </section><SyncStatus /></main>
  </div>;
  const { snapshot } = account;
  const items = visibleItems(account);
  const archived = items.filter(i => i.archived).reverse();
  const checkedCount = items.filter(i => i.status === "CHECKED" && !i.shopping_completed_at).length;
  return <div className={`spl-shell${page === "list" ? " spl-shopping-shell" : ""}`}>
    <PullToRefresh /><Header user={snapshot.user} /><SyncStatus />
    <main className="spl-main">
      <h1 id="shopping-title" className="spl-sr-only" tabIndex={-1}>{page === "archive" ? "Archive" : "Shopping list"}</h1>
      {page === "fallback" ? <section className="spl-card spl-offline-start"><h2>This view requires a connection</h2><p>Your shopping list and archive are available below.</p></section> : page === "archive" ? <section className="spl-card">
        <div className="spl-card-header"><h2 className="spl-card-title">Archive</h2>{archived.length > 0 && <span className="spl-card-count">{archived.length}</span>}</div>
        {archived.length ? <div className="spl-list">{archived.map(item => <ArchiveRow key={item.id} item={item} />)}</div> : <div className="spl-list-empty">Nothing has been archived yet.</div>}
      </section> : <>
        <AddItemForm recentItems={[...snapshot.history].sort((a, b) => (b.last_used_at ?? "").localeCompare(a.last_used_at ?? "")).slice(0, 10)} />
        {checkedCount > 0 && <CompleteShoppingBar checkedCount={checkedCount} />}
        {snapshot.categories.map(category => <CategorySection key={category.id} category={{ ...category, items: items.filter(i => !i.archived && i.category_id === category.id).sort((a, b) => Number(a.status === "CHECKED") - Number(b.status === "CHECKED")) }}
          isAdmin={snapshot.user.role === "ADMIN"} currentUserId={snapshot.user.id} allCategories={snapshot.categories} imageStorage={snapshot.imageStorage} />)}
      </>}
    </main>
    <UndoSnackbarArea />
    <footer className="spl-footer"><a href="/list" className="spl-link-muted" onClick={e => navigate(e, "list")}>Shopping list</a>{" · "}<a href="/archive" className="spl-link-muted" onClick={e => navigate(e, "archive")}>Archive</a></footer>
  </div>;
}
