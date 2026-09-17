import ItemRow from "./ItemRow";
import { getCategoryIcon } from "@/lib/category-icons";
import type { Category, CategoryWithItems } from "@/lib/types";
import { displayCategoryName } from "@/lib/presentation";

interface Props {
  category: CategoryWithItems;
  isAdmin: boolean;
  allCategories: Category[];
}

export default function CategorySection({ category, isAdmin, allCategories }: Props) {
  const isDefault = category.is_default === 1;
  const openCount = category.items.filter((item) => item.status === "ACTIVE").length;

  return (
    <section className="spl-card" data-default={isDefault}>
      <div className="spl-card-header">
        <span className="spl-card-icon">
          <i className={`fa-solid ${getCategoryIcon(category.name, isDefault)}`} aria-hidden="true" />
        </span>
        <h2 className="spl-card-title">{displayCategoryName(category.name)}</h2>
        {openCount > 0 && <span className="spl-card-count">{openCount}</span>}
      </div>

      {category.items.length === 0 ? (
        <div className="spl-list-empty">
          <i className="fa-solid fa-box-open" aria-hidden="true" />
          No items yet.
        </div>
      ) : (
        <div className="spl-list">
          {category.items.map((item) => (
            <ItemRow key={item.id} item={item} isAdmin={isAdmin} categories={allCategories} />
          ))}
        </div>
      )}
    </section>
  );
}
