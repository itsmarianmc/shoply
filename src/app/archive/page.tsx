import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getArchivedItems } from "@/lib/items";
import { maintainImageStorage } from "@/lib/item-images";
import AutoRefresh from "@/components/AutoRefresh";
import Header from "@/components/Header";
import ArchiveRow from "@/components/ArchiveRow";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  maintainImageStorage();
  const items = getArchivedItems();

  return (
    <div className="spl-shell">
      <Header user={user} />
      <AutoRefresh />

      <main className="spl-main">
        <section className="spl-card">
          <div className="spl-card-header">
            <span className="spl-card-icon">
              <i className="fa-solid fa-box-archive" aria-hidden="true" />
            </span>
            <h2 className="spl-card-title">Archive</h2>
            {items.length > 0 && <span className="spl-card-count">{items.length}</span>}
          </div>

          {items.length === 0 ? (
            <div className="spl-list-empty">
              <i className="fa-solid fa-box-open" aria-hidden="true" />
              Nothing has been archived yet.
            </div>
          ) : (
            <div className="spl-list">
              {items.map((item) => (
                <ArchiveRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
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
