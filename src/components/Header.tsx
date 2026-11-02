"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/list/actions";
import type { PublicUser } from "@/lib/types";
import { useState } from "react";
import { clearForLogout, onlineAvailable, pendingCount, useOffline } from "@/lib/offline/client";
import ConfirmDialog from "./ConfirmDialog";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] ?? "").join("");
}

export default function Header({
  user,
}: { user: PublicUser }) {
  const pathname = usePathname();
  const offline = useOffline();
  const online = offline.connected && !offline.locked;
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [error, setError] = useState("");
  async function signOut(discard = false) {
    try {
      if (!onlineAvailable()) { setError("Connect to sign out securely. Pending work remains on this device."); return; }
      if (!discard && await pendingCount()) { setConfirmLogout(true); return; }
      await clearForLogout(discard, logoutAction);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not sign out. Connect and try again."); }
  }
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isSettingsPage = pathname === "/settings";

  return (
    <header className="spl-header">
      <div className="spl-brand">
        <span className="spl-brand-icon">
          <i className="fa-solid fa-basket-shopping" aria-hidden="true" />
        </span>
      </div>

      <div className="sql-switchable">
        <span className="spl-brand-mark">Shoply</span>
        <div className="spl-header-user">
          <span className="spl-avatar" aria-hidden="true">
            {initialsOf(user.name)}
          </span>
          <div className="spl-user-meta">
            <span className="spl-user-name">{user.name}</span>
            <span className="spl-role-pill" data-role={user.role}>
              {user.role === "ADMIN" ? "Admin" : "Member"}
            </span>
          </div>
        </div>
      </div>

      <div className="spl-header-actions">
        <Link
          prefetch={false}
          href={isSettingsPage ? "/list" : "/settings"}
          className="spl-icon-btn"
          aria-label={isSettingsPage ? "Shopping list" : "Settings"}
          title={isSettingsPage ? "Shopping list" : "Settings"}
          aria-disabled={!online}
          onClick={e => { if (!online) { e.preventDefault(); setError("Settings require a connection."); } }}
        >
          <i className={`fa-solid ${isSettingsPage ? "fa-house" : "fa-gear"}`} aria-hidden="true" />
        </Link>

        {user.role === "ADMIN" && (
          <Link
            prefetch={false}
            href={isAdminPage ? "/list" : "/admin"}
            className="spl-icon-btn"
            aria-label={isAdminPage ? "Shopping list" : "Admin area"}
            title={isAdminPage ? "Shopping list" : "Admin area"}
            aria-disabled={!online}
            onClick={e => { if (!online) { e.preventDefault(); setError("Administration requires a connection."); } }}
          >
            <i className={`fa-solid ${isAdminPage ? "fa-house" : "fa-user-gear"}`} aria-hidden="true" />
          </Link>
        )}

        <form action={() => signOut()}>
          <button type="submit" className="spl-icon-btn" aria-label="Sign out" title="Sign out">
            <i className="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" />
          </button>
        </form>
        {error && <p className="spl-header-error" role="alert">{error}</p>}
        {confirmLogout && <ConfirmDialog title="Unsynchronized changes" cancelLabel="Keep shopping" message="Some changes have not reached the server. Cancel to synchronize them, or explicitly discard this device’s pending changes and sign out." confirmLabel="Discard pending changes and sign out" onConfirm={() => { setConfirmLogout(false); void signOut(true); }} onCancel={() => setConfirmLogout(false)} />}
      </div>
    </header>
  );
}
