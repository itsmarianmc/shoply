"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/list/actions";
import type { PublicUser } from "@/lib/types";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] ?? "").join("");
}

export default function Header({
  user,
}: { user: PublicUser }) {
  const pathname = usePathname();
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
          href={isSettingsPage ? "/list" : "/settings"}
          className="spl-icon-btn"
          aria-label={isSettingsPage ? "Shopping list" : "Settings"}
          title={isSettingsPage ? "Shopping list" : "Settings"}
        >
          <i className={`fa-solid ${isSettingsPage ? "fa-house" : "fa-gear"}`} aria-hidden="true" />
        </Link>

        {user.role === "ADMIN" && (
          <Link
            href={isAdminPage ? "/list" : "/admin"}
            className="spl-icon-btn"
            aria-label={isAdminPage ? "Shopping list" : "Admin area"}
            title={isAdminPage ? "Shopping list" : "Admin area"}
          >
            <i className={`fa-solid ${isAdminPage ? "fa-house" : "fa-user-gear"}`} aria-hidden="true" />
          </Link>
        )}

        <form action={logoutAction}>
          <button type="submit" className="spl-icon-btn" aria-label="Sign out" title="Sign out">
            <i className="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" />
          </button>
        </form>
      </div>
    </header>
  );
}
