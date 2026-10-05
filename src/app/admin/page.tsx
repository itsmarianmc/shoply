import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getAllCategories } from "@/lib/categories";
import { listUsers } from "@/lib/users";
import { getCheckedItemBehavior } from "@/lib/settings";
import Header from "@/components/Header";
import AdminCategoryManager from "@/components/AdminCategoryManager";
import AdminAccountManager from "@/components/AdminAccountManager";
import AdminSettingsPanel from "@/components/AdminSettingsPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/list");

  const categories = getAllCategories();
  const users = listUsers();
  const behavior = getCheckedItemBehavior();

  return (
    <div className="spl-shell">
      <Header user={user} />

      <main className="spl-main">
        <AdminSettingsPanel behavior={behavior} />
        <AdminCategoryManager categories={categories} />
        <Link href="/admin/images" className="spl-card spl-admin-images-link">
          <span><i className="fa-solid fa-images" aria-hidden="true" /> Images</span>
          <span aria-hidden="true">&#x3E;</span>
        </Link>
        <AdminAccountManager users={users} requestingUserId={user.id} />
      </main>

      <footer className="spl-footer">
        <Link href="/list" className="spl-link-muted">
          <i className="fa-solid fa-basket-shopping" aria-hidden="true" />
          Back to list
        </Link>
      </footer>
    </div>
  );
}
