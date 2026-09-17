export type Role = "ADMIN" | "MEMBER";

export interface User {
  id: number;
  name: string;
  role: Role;
  password_hash: string;
  created_at: string;
}

export interface PublicUser {
  id: number;
  name: string;
  role: Role;
}

export interface Category {
  id: number;
  name: string;
  sort_order: number;
  is_default: 0 | 1;
  created_at: string;
}

export type ItemStatus = "ACTIVE" | "CHECKED";

export interface Item {
  id: number;
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  category_id: number;
  added_by_user_id: number | null;
  status: ItemStatus;
  checked_by_user_id: number | null;
  checked_at: string | null;
  archived: 0 | 1;
  archived_at: string | null;
  sort_order: number;
  created_at: string;
}

export interface ItemWithNames extends Item {
  added_by_name: string | null;
  checked_by_name: string | null;
}

export interface CategoryWithItems extends Category {
  items: ItemWithNames[];
}

export type CheckedItemBehavior = "KEEP_IN_LIST" | "ARCHIVE";

export interface ItemHistory {
  id: number;
  normalized_name: string;
  display_name: string;
  category_id: number | null;
  category_name: string;
  default_quantity: number | null;
  default_unit: string | null;
  use_count: number;
  last_used_at: string;
}

export const VALID_UNITS = [
  "piece",
  "pack",
  "bottle",
  "can",
  "bag",
  "g",
  "kg",
  "ml",
  "l",
] as const;

export type Unit = (typeof VALID_UNITS)[number];
