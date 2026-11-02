import { EDIT_FIELDS, type LocalAccount, type SyncItem } from "./types";

const DATABASE = "shoply-private-offline";
const STORE = "accounts";
const IMAGES = "images";
export const LOCAL_IMAGE_LIMIT = 50 * 1024 * 1024;
let opened: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
  if (!opened) opened = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error("Local storage is unavailable. Changes cannot be saved.")); return; }
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      if (!request.result.objectStoreNames.contains(IMAGES)) request.result.createObjectStore(IMAGES);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other Shoply windows to upgrade local storage."));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opened = undefined; };
      resolve(db);
    };
  }).catch(error => { opened = undefined; throw error; });
  return opened;
}

export function assertLocal(value: unknown): asserts value is LocalAccount {
  const data = value as LocalAccount;
  if (!data || data.schema !== 1 || data.snapshot?.protocol !== 1 ||
    !Array.isArray(data.snapshot.items) || !Array.isArray(data.snapshot.categories) || !Array.isArray(data.snapshot.history) ||
    !Array.isArray(data.queue) || !data.links || !data.localIds || !Number.isSafeInteger(data.nextId) || data.nextId >= 0 ||
    !data.snapshot.accountKey || !data.snapshot.user || !Number.isSafeInteger(data.snapshot.user.id) ||
    typeof data.snapshot.user.name !== "string" || !["MEMBER", "ADMIN"].includes(data.snapshot.user.role) ||
    !["KEEP_IN_LIST", "ARCHIVE"].includes(data.snapshot.behavior) || typeof data.locked !== "boolean" ||
    !data.snapshot.imageStorage || !data.snapshot.links ||
    data.snapshot.categories.some(c => !c || !Number.isSafeInteger(c.id) || typeof c.name !== "string" || ![0, 1].includes(c.is_default)) ||
    data.snapshot.history.some(h => !h || typeof h.display_name !== "string" || typeof h.category_name !== "string") ||
    (data.localRevision !== undefined && (!Number.isSafeInteger(data.localRevision) || data.localRevision < 0)) ||
    data.queue.some(q => !q || typeof q.id !== "string" || typeof q.target !== "string" ||
      !["add", "edit", "check", "uncheck", "undo", "delete", "restore", "complete", "accept"].includes(q.kind) ||
      (q.base !== null && !validItem(q.base)) || (q.kind === "add" && (!q.fields || typeof q.fields.name !== "string")) ||
      (q.kind === "edit" && (!q.patch || typeof q.patch !== "object")) ||
      (q.problem && (typeof q.problem.message !== "string" || (q.problem.item !== null && !validItem(q.problem.item))))) ||
    data.snapshot.items.some(i => !validItem(i))) {
    throw new Error("This device's saved data is damaged or uses an unsupported version. It has been retained. Export it before resetting storage.");
  }
}

function validItem(item: SyncItem): boolean {
  return !!item && typeof item.name === "string" && typeof item.key === "string" && Number.isSafeInteger(item.id) &&
    Number.isSafeInteger(item.category_id) && (item.quantity === null || (typeof item.quantity === "number" && Number.isFinite(item.quantity))) &&
    (item.note === null || typeof item.note === "string") && (item.unit === null || typeof item.unit === "string") &&
    [item.archived_at, item.checked_at, item.shopping_completed_at].every(value => value === null || typeof value === "string") &&
    ["ACTIVE", "CHECKED"].includes(item.status) && [0, 1].includes(item.archived) && !!item.versions &&
    [...EDIT_FIELDS, "lifecycle", "version"].every(field => Number.isSafeInteger(item.versions[field as keyof typeof item.versions]) && item.versions[field as keyof typeof item.versions] > 0);
}

// The read, queue append, snapshot change, and commit acknowledgement all share
// one IDB transaction. Never resolve on request.onsuccess before tx.oncomplete.
export async function changeAccount(key: string, change: (current: LocalAccount | undefined) => LocalAccount | undefined): Promise<LocalAccount | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = db.transaction(STORE, "readwrite", { durability: "strict" }); }
    catch { tx = db.transaction(STORE, "readwrite"); }
    let result: LocalAccount | undefined;
    let failure: unknown;
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error("Local save failed. This change was not saved."));
    const store = tx.objectStore(STORE);
    const get = store.get(key);
    get.onsuccess = () => {
      try {
        if (get.result !== undefined) assertLocal(get.result);
        const revision = (get.result as LocalAccount | undefined)?.localRevision ?? 0;
        result = change(get.result);
        if (result) result.localRevision = revision + 1;
        if (result) { assertLocal(result); store.put(result, key); }
        else store.delete(key);
      } catch (error) { failure = error; tx.abort(); }
    };
  });
}

export async function readAccount(key: string): Promise<LocalAccount | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const get = tx.objectStore(STORE).get(key);
    get.onsuccess = () => {
      try { if (get.result !== undefined) assertLocal(get.result); resolve(get.result); }
      catch (error) { reject(error); }
    };
    get.onerror = () => reject(get.error);
  });
}

export async function rawAccount(key: string): Promise<unknown> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const get = db.transaction(STORE).objectStore(STORE).get(key);
    get.onsuccess = () => resolve(get.result);
    get.onerror = () => reject(get.error);
  });
}

export async function removeAccount(key: string): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, IMAGES], "readwrite");
    tx.objectStore(STORE).delete(key);
    const images = tx.objectStore(IMAGES).openCursor(IDBKeyRange.bound([key, ""], [key, "\uffff"]));
    images.onsuccess = () => { const cursor = images.result; if (cursor) { cursor.delete(); cursor.continue(); } };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}

// Photos are optional private data, never HTTP/worker cache entries. Check the
// account and current snapshot in the same transaction as every blob access.
function permitsImage(account: LocalAccount | undefined, imageId: string): boolean {
  return !!account && !account.locked && account.snapshot.items.some(item => item.image_id === imageId);
}

export async function readImage(key: string, imageId: string): Promise<Blob | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, IMAGES]);
    let blob: Blob | undefined;
    const account = tx.objectStore(STORE).get(key);
    account.onsuccess = () => {
      if (!permitsImage(account.result, imageId)) return;
      const image = tx.objectStore(IMAGES).get([key, imageId]);
      image.onsuccess = () => { blob = image.result as Blob | undefined; };
    };
    tx.oncomplete = () => resolve(blob);
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}

export async function storeImage(key: string, imageId: string, blob: Blob): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, IMAGES], "readwrite");
    let failure: unknown;
    const account = tx.objectStore(STORE).get(key);
    account.onsuccess = () => {
      if (!permitsImage(account.result, imageId)) return;
      const store = tx.objectStore(IMAGES);
      let bytes = blob.size;
      const entries = store.openCursor(IDBKeyRange.bound([key, ""], [key, "\uffff"]));
      entries.onsuccess = () => {
        try {
          const cursor = entries.result;
          if (cursor) {
            const id = (cursor.key as string[])[1]!;
            if (!permitsImage(account.result, id)) cursor.delete();
            else if (id !== imageId) bytes += (cursor.value as Blob).size;
            cursor.continue(); return;
          }
          if (bytes > LOCAL_IMAGE_LIMIT) throw new Error("The 50 MB offline photo limit was reached. Some photos will show a placeholder offline.");
          store.put(blob, [key, imageId]);
        } catch (error) { failure = error; tx.abort(); }
      };
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(failure ?? tx.error);
  });
}

export async function pruneImages(key: string): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, IMAGES], "readwrite");
    const account = tx.objectStore(STORE).get(key);
    account.onsuccess = () => {
      const entries = tx.objectStore(IMAGES).openCursor(IDBKeyRange.bound([key, ""], [key, "\uffff"]));
      entries.onsuccess = () => {
        const cursor = entries.result;
        if (cursor) { if (!permitsImage(account.result, (cursor.key as string[])[1]!)) cursor.delete(); cursor.continue(); }
      };
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}

// Fallback for browsers without Web Locks. A suspended lease holder may retry
// concurrently after expiry; stable server receipts and dependency checks also
// protect that case. Queue acknowledgements always remove by operation ID.
export async function lease(key: string, owner: string, release = false): Promise<boolean> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const request = store.get(`lease:${key}`);
    let acquired = false;
    request.onsuccess = () => {
      const previous = request.result as { owner: string; until: number } | undefined;
      if (previous && previous.owner !== owner && previous.until > Date.now()) return;
      acquired = true;
      if (release) store.delete(`lease:${key}`);
      else store.put({ owner, until: Date.now() + 30000 }, `lease:${key}`);
    };
    tx.oncomplete = () => resolve(acquired);
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
