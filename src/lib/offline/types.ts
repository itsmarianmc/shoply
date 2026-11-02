import type { Category, CheckedItemBehavior, ItemWithNames, PublicUser } from "../types";
import type { ImageStorageUsage } from "../image-policy";
import type { ValidatedItemFields } from "../validation";

export const PROTOCOL = 1;
export const EDIT_FIELDS = ["name", "quantity", "unit", "note", "category_id"] as const;
export type EditField = typeof EDIT_FIELDS[number];
export type Versions = Record<EditField | "lifecycle" | "version", number>;
export interface SyncItem extends ItemWithNames {
  key: string;
  shopping_completed_at: string | null;
  versions: Versions;
  pendingFrom?: string;
}
export interface Suggestion {
  display_name: string;
  category_id: number | null;
  category_name: string;
  default_quantity: number | null;
  default_unit: string | null;
  use_count?: number;
  last_used_at?: string;
}
export interface Snapshot {
  protocol: 1;
  accountKey: string;
  user: PublicUser;
  revision: number;
  items: SyncItem[];
  categories: Category[];
  history: Suggestion[];
  behavior: CheckedItemBehavior;
  imageStorage: ImageStorageUsage;
  links: Record<string, number>;
}
export type OperationKind = "add" | "edit" | "check" | "uncheck" | "undo" | "delete" | "restore" | "complete" | "accept";
export interface Operation {
  id: string;
  kind: OperationKind;
  target: string;
  base: SyncItem | null;
  baseFrom?: string;
  fields?: ValidatedItemFields;
  categoryId?: number;
  patch?: Partial<Pick<SyncItem, EditField>>;
  duplicate?: SyncItem;
  delayed: boolean;
  trip?: string;
  adoptId?: number;
}
export interface Receipt {
  outcome: "applied" | "conflict" | "blocked";
  message?: string;
  item: SyncItem | null;
  serverId?: number;
  // A notification is a one-shot attempt only on the first HTTP delivery.
  notificationSessionId?: number;
}
export interface QueuedOperation extends Operation {
  problem?: Receipt;
}
export interface LocalAccount {
  schema: 1;
  snapshot: Snapshot;
  queue: QueuedOperation[];
  links: Record<string, number>;
  localIds: Record<string, number>;
  nextId: number;
  locked: boolean;
  localRevision?: number;
}
