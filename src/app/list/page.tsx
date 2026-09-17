import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getCategoriesWithItems, getAllCategories } from "@/lib/categories";
import { getRecentItems } from "@/lib/items";
import Header from "@/components/Header";
import AddItemForm from "@/components/AddItemForm";
import CategorySection from "@/components/CategorySection";
import CompleteShoppingBar from "@/components/CompleteShoppingBar";
import UndoSnackbarArea from "@/components/UndoSnackbarArea";
import AutoRefresh from "@/components/AutoRefresh";
import PullToRefresh from "@/components/PullToRefresh";

export const dynamic = "force-dynamic";

export default async function ListPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const categories = getCategoriesWithItems();
  const allCategories = getAllCategories();
  const recentItems = getRecentItems(10, user.role !== "ADMIN");
  const isAdmin = user.role === "ADMIN";

  const checkedCount = categories.reduce(
    (sum, cat) =>
      sum + cat.items.filter((i) => i.status === "CHECKED").length,
    0
  );

  return (
    <div className="spl-shell">
      <PullToRefresh />
      <Header user={user} />
      <AutoRefresh />

      <main className="spl-main">
        <AddItemForm recentItems={recentItems} />

        {categories.map((category) => (
          <CategorySection
            key={category.id}
            category={category}
            isAdmin={isAdmin}
            allCategories={allCategories}
          />
        ))}

        {checkedCount > 0 && (
          <CompleteShoppingBar checkedCount={checkedCount} />
        )}
      </main>

      <UndoSnackbarArea />

      <footer className="spl-footer">
        <Link href="/archive" className="spl-link-muted">
          <i className="fa-solid fa-box-archive" aria-hidden="true" />
          Archive
        </Link>
      </footer>
    </div>
  );
}
