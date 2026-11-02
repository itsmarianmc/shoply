# Shoply

Shoply is a shared household shopping list built with Next.js and SQLite. It runs as a single container with persistent SQLite storage and does not require an external database.

Household members can add, check off, restore, and archive items. Administrators can also manage categories, accounts, passwords, and app settings. The mobile-first PWA saves shopping changes locally before synchronizing them with central SQLite. After authenticated online setup on the same browser/device, the list and archive can reopen and work offline.

## Why Shoply exists

Shoply was built out of frustration with shopping-list apps that feel overloaded, difficult to understand, and cluttered with settings, extra sections, and complex navigation. The goal was to create a focused alternative that does one thing well: keep a household shopping list simple and easy to use.

The app deliberately follows a minimalist approach with a clear interface and as little cognitive overhead as possible. It is designed especially for parents and other family members who should be able to open the app and understand it immediately, without having to learn a complicated system first.

## Quick start

### Run with Docker Compose

Node.js is not needed for the Docker workflow. Docker Engine and the Docker Compose plugin are required.

1. Copy the example environment file and set the account names:

   ```powershell
   Copy-Item .env.example .env
   ```

   Edit `ADMIN_NAMES` and `MEMBER_NAMES` in `.env`. They accept comma-separated names. Set `FONTAWESOME_HOST` to the full URL of your hosted Pro `all.css` file; Font Awesome icons are not loaded when this variable is blank.

2. Build and start Shoply:

   ```sh
   docker compose up -d --build
   ```

3. Open [http://localhost:3000](http://localhost:3000). On first startup, the container creates the database and accounts. Read the generated initial passwords from the container logs and store them securely:

   ```sh
   docker compose logs shoply
   ```

The default Compose file stores the database in `./data`. Use `docker-compose.yml-linux` when you want to set a custom host directory with `DATA_VOLUME_PATH`.

### Run locally for development

Use Node.js 20 or newer. The seed script reads its settings from the process environment, so export the account names before seeding. Set `FONTAWESOME_HOST` in `.env` or the process environment to load the separately hosted Pro stylesheet.

PowerShell:

```powershell
$env:ADMIN_NAMES = "Admin"
$env:MEMBER_NAMES = "Family"
npm ci
npm run seed
npm run dev
```

On macOS or Linux, set the equivalent variables with `export ADMIN_NAMES=Admin` and `export MEMBER_NAMES=Family`. The Next.js development server reads environment variables from the process; local data is stored in `./data/shoply.db` unless `DATA_DIR` is set.

Open [http://localhost:3000](http://localhost:3000).

## Features

- Shared, categorized shopping list with item quantity, unit, and note fields.
- Add, check off, uncheck, edit, and restore items. A short-lived undo snackbar can undo a check, including one that automatically archived the item.
- Optional automatic archiving when an item is checked, plus a “Complete shopping” action that archives all checked items in one transaction.
- Temporary item photos with list/detail thumbnails, an accessible enlarged view, and uploads/replacement for every signed-in member. Only admins can remove individual photos or manage image storage.
- Admin image management and a 100 MB–10 GB storage quota (1 GB by default), with live usage and server-enforced upload limits.
- Item history with autocomplete, recently used items, and remembered quantity/unit defaults.
- Category memory for administrators. Members’ new items always go into the default “Uncategorized” category.
- Duplicate merging for active items with the same name and category when both quantities are numeric and their units and notes match.
- Admin tools for category management, account creation/deletion, password resets, and the checked-item behavior setting.
- Role-based access: members can use the list; administrators can also manage categories, accounts, and settings.
- Cross-user refresh through authenticated snapshot reconciliation every five seconds while reachable, plus startup, visibility, and connectivity triggers. Failed requests use bounded exponential backoff.
- Installable PWA with an account-bound IndexedDB snapshot, durable operation queue, generic precached startup shell, conflict review, and explicit synchronization status.
- Font Awesome CSS loads from the Pro `all.css` file configured by `FONTAWESOME_HOST`.

Manual archiving of a checked item directly from its list row is not currently connected to a server action or UI control.

## Technology

| Technology | Use |
| --- | --- |
| Next.js 15.5.25, App Router | Routing, Server Components, Server Actions |
| React 19.0.3 | UI |
| TypeScript 5.7.3 | Strictly typed application code |
| better-sqlite3 11.8.1 | Server-side SQLite access in WAL mode |
| bcryptjs 2.4.3 | Password hashing with 12 rounds |
| Vitest 4.1.11 | Unit and integration tests |
| Serwist 9.5.12 | PWA service worker and precaching |
| Docker | Single-container deployment |
| Node.js 20 or newer | Local development and container runtime |

Pinned dependency versions are listed in `package.json`. Font Awesome Pro is a commercial asset. Its local files are excluded from Git and the Docker build context; configure `FONTAWESOME_HOST` with the full URL of a separately hosted Pro `all.css` file. The host must also serve the referenced webfont files and permit cross-origin font requests from the Shoply origin. Because the external stylesheet and fonts are not same-origin precache assets, icons loaded from that host need network access.

## Repository layout

```text
shoply/
├── .env.example                 Example runtime and seed settings
├── .gitignore                   Git exclusions for local data and Pro assets
├── .dockerignore                Docker build-context exclusions
├── package.json                 Scripts and dependencies
├── Dockerfile                   Three-stage production image
├── docker-compose.yml           Default Compose setup, ./data volume
├── docker-compose.yml-linux     Compose setup with configurable data path
├── docker-entrypoint.sh         Database initialization and privilege drop
├── db/
│   └── schema.sql               Idempotent SQLite schema
├── scripts/
│   ├── seed.cjs                 Create schema, accounts, and categories
│   ├── delete-user.cjs          Delete an account with safety checks
│   ├── reset-passwords.cjs      Reset all account passwords
│   ├── verify-admin-guard.ts    Manual admin-guard verification
│   ├── register-test-hooks.mjs  Test hook for the server-only stub
│   ├── empty-module.cjs         Empty module used by the test hook
│   ├── delete                     Container wrapper for delete-user.cjs
│   ├── resetpasswords             Container wrapper for reset-passwords.cjs
│   └── server-only-stub-hook.mjs Legacy loader hook
├── tests/
│   ├── items.test.ts            Item, history, archive, and merge tests
│   ├── shopping-session-push.test.ts
│   │                             Push subscription and shopping-session tests
│   ├── validation.test.ts       Input validation tests
│   └── stubs/server-only.ts     Vitest stub for server-only
├── vitest.config.mts            Test aliases and setup
├── vitest.setup.ts              In-memory SQLite test database
├── data/                        Local SQLite database (created at runtime)
├── public/
│   ├── favicon.ico / favicon.png Browser favicons
│   ├── sw.js                    Generated Serwist build artifact; do not edit
│   └── icons/                   PWA icons
└── src/
    ├── middleware.ts            Cookie-presence routing redirects
    ├── lib/                     Database, authentication, and business logic
    ├── components/              Shared UI components
    └── app/                     Routes, Server Actions, manifest, and service worker
```

The repository has Git metadata and ignore rules. Git excludes local environment files, database files, generated output, and local Font Awesome Pro assets while retaining `.env.example`. Docker also excludes local environment files, database files, and local Pro assets from its build context.

## Architecture

The app follows the Next.js App Router model:

1. **Middleware** checks for the `shoply_session` cookie and redirects between protected pages and `/login`. It does not access SQLite because `better-sqlite3` is a native Node module and cannot run in the Edge middleware runtime.
2. **Pages and Server Actions** perform authoritative session and role checks with `getCurrentUser()`, `requireUser()`, and `requireAdmin()`. Actions validate input, perform writes, and revalidate affected paths or redirect.
3. **Library modules** in `src/lib/` hold database access and business rules. `db.ts` reuses a single SQLite connection, enables WAL, foreign keys, and a five-second busy timeout, and applies the schema.
4. **UI components** combine server-rendered pages with client-side components that use React form/action state and local UI state.

On container startup, `docker-entrypoint.sh` creates and permissions `DATA_DIR`, runs the idempotent seed script, and then starts Next.js as the unprivileged `shoply` user. Locally, `npm run seed` is optional if the database and accounts already exist. SQLite is created under `./data/shoply.db` by default.

SQLite remains authoritative; item image files live in `DATA_DIR/item-images`. The list and archive use the existing shopping components through `src/lib/offline/`, with authenticated synchronization at `/api/offline`. Administration continues to use Server Components and Server Actions. Images use authenticated Route Handlers. Font Awesome loads from `FONTAWESOME_HOST`, with local system glyphs when that optional font is unavailable.

Server-side library modules import `server-only` to prevent accidental inclusion in client bundles. The web interface and maintenance-script output are in English.

## Main modules

| Module | Responsibility |
| --- | --- |
| `src/lib/db.ts` | Singleton SQLite connection, schema application, and migrations |
| `src/lib/auth.ts` | Password verification, sessions, and user/admin authorization |
| `src/lib/users.ts` | Account creation, password reset, and guarded deletion |
| `src/lib/items.ts` | Item lifecycle, merge rules, history, autocomplete, and recent items |
| `src/lib/categories.ts` | Category CRUD, item moves, history updates, and safe category deletion |
| `src/lib/revision.ts` | Monotonic revision counter used for cross-user refresh |
| `src/lib/undo-global.ts` | Small typed global undo-event queue |
| `src/lib/settings.ts` | Checked-item behavior setting |
| `src/lib/category-icons.ts` | Keyword-based category icon assignment |
| `src/lib/push-config.ts` / `push-subscriptions.ts` / `push.ts` | VAPID configuration, subscription ownership, and delivery |
| `src/lib/shopping-sessions.ts` | Global shopping-session lifecycle and timeout handling |
| `src/lib/presentation.ts` | Display labels for categories and units |
| `src/lib/types.ts` / `validation.ts` | Shared TypeScript models and server-side validation |
| `src/app/*/actions.ts` | Route-level Server Actions and authorization |
| `src/components/` | Shared list, archive, admin, dialog, and navigation UI |
| `src/app/sw.ts` | Serwist service worker configuration |

Key components include:

- `AddItemForm.tsx`: item entry with debounced autocomplete, recent items, and remembered defaults.
- `ItemRow.tsx`: item controls, undo events, and the administrator-only move menu.
- `ItemDetailDialog.tsx`: bottom-sheet editor for quantity, unit, note, and (for admins) category.
- `UndoSnackbarArea.tsx`: consumes undo events and presents a six-second undo action.
- `CompleteShoppingBar.tsx`: archives all checked items in a single transaction.
- `AutoRefresh.tsx`: polls the revision action every five seconds and refreshes only when data changes.
- `AdminCategoryManager.tsx`, `AdminAccountManager.tsx`, and `AdminSettingsPanel.tsx`: administrator tools.
- `PageTransition.tsx`: View Transitions API support with a CSS fallback.

The category move menu follows the listbox keyboard pattern (arrow keys, Home/End, Enter/Space, Escape, and focus return). The item detail sheet edits quantity, unit, and note for all signed-in users; only administrators can change an item's category there.

## Data model and state

The database schema is in `db/schema.sql`. Its main tables are:

| Table | Purpose |
| --- | --- |
| `users` | Account names, roles, and bcrypt password hashes |
| `sessions` | Random session tokens, user references, and expiry times |
| `categories` | Categories and the protected default category |
| `items` | Active, checked, and archived shopping-list items |
| `app_settings` | Key/value application settings |
| `item_history` | Remembered item names, categories, defaults, and usage history |
| `push_subscriptions` | Per-user browser push endpoints and delivery status |
| `shopping_sessions` | Global shopping-session start, activity, and end timestamps |
| `item_images` | Generated image identifiers, item associations/names, byte sizes, and durable deletion state; no binary image data |

Roles are `ADMIN` and `MEMBER`. Item states are `ACTIVE` and `CHECKED`; checked-item behavior is `KEEP_IN_LIST` or `ARCHIVE`. An item has an optional numeric quantity, unit, note, and checked/archived metadata.

`item_history` has one row per normalized item name. It is updated when an item is checked or moved, not when it is first added. Administrators can reuse a remembered category; members always add items to the default category, while everyone can benefit from remembered quantity and unit defaults. If a remembered category is deleted, the item falls back to the default category.

There is no third-party client state-management library. Shopping views subscribe to the local-first store with React's `useSyncExternalStore`; components retain their own interaction state. `window.__shoplyUndoStack` carries check events from `ItemRow` to `UndoSnackbarArea`. Shopping snapshot polling replaces list/archive revision refresh, while `AutoRefresh` remains in admin image management.

The TypeScript model also defines `User` and `PublicUser` (the latter omits the password hash), `Category`, `Item`, `ItemWithNames`, `CategoryWithItems`, and `ItemHistory`. Supported units are a fixed list: piece, pack, bottle, can, bag, g, kg, ml, and l.

Schema constraints include unique account and category names, a role check for `ADMIN`/`MEMBER`, at most one default category, and status checks for items. Item category references use `ON DELETE RESTRICT`; user references use `ON DELETE SET NULL`. Session rows cascade when a user is deleted. History category references use `ON DELETE SET NULL` and retain a category-name snapshot. The default checked-item setting is `KEEP_IN_LIST`.

Server-side input validation trims values and applies length limits: item names up to 200 characters, notes up to 500, category names up to 100, and account names up to 50. Quantities must be positive when updated.

The worker precaches generic `/offline` HTML and build-versioned first-party assets. Authenticated HTML, RSC responses, APIs, and item images are network-only. Private shopping data and pending operations live in account-bound IndexedDB records, outside HTTP/navigation caches. See the offline section below.

## Offline shopping and synchronization

### First use and startup

Serve a production build over HTTPS (localhost also works). Open Shoply online, sign in, and wait for **Offline startup ready on this device** and **Connected · synchronized**. Setup saves the complete list/archive, categories, checked-item behavior, and up to 500 useful history/suggestion records. It also installs the generic startup shell and required first-party scripts/styles/icons. Development mode deliberately disables the service worker.

After setup, `/list`, `/archive`, reloads, direct navigation, back/forward navigation, and PWA launches can restore the device's last saved account snapshot. The same shopping components handle online and offline work. Startup restores IndexedDB first, then contacts the server; failed refreshes keep the snapshot and queue. A fresh installation, a different browser/profile, cleared/evicted storage, or a device that never completed setup cannot supply offline shopping data. If the shell exists without a usable private snapshot, it explains the need to connect and sign in. A device without any installed worker/assets needs a network connection even to load that fallback.

The small status panel distinguishes connected/acknowledged, offline/local, pending/synchronizing, and attention states. Expand it to inspect operation IDs, pending intentions, conflicts, retry, or download a private JSON recovery reference. It never labels a pending operation synchronized. A storage error explicitly says the change was not saved; keep form input open, free storage, and retry. Corrupt or unknown local schema versions are retained rather than automatically overwritten. The panel offers an explicit destructive reset after warning about lost pending work; exports are for recovery/reference and are not automatically imported.

Administration, settings management, AI scans, and image changes require the server. Item image bytes are never persisted in IndexedDB or Cache Storage; thumbnails use an offline/unavailable placeholder. System glyphs keep essential buttons usable without the external icon font.

### Local commits, account identity, and logout

`shoply-private-offline` IndexedDB version 1 stores account records containing the server snapshot, ordered operations, identity links, local IDs, and durable blocked results. Every mutation updates the working snapshot/queue in one read/write transaction and waits for transaction completion before reporting success. Strict transaction durability is requested where supported. Each new item has a UUID local reference independent of its eventual numeric SQLite ID; queued dependencies refer to preceding operation receipts.

`shoply_account` is a public random cache selector, **not a credential**. The HttpOnly session remains the only authentication credential. Each user receives a durable random account key; recreating a user or a database does not accidentally reuse another account's queue. Every sync request verifies the session, account ownership, current role, and applicable item ownership. Cached roles and client timestamps grant no server authority. Known expired/revoked sessions lock the local view and retain its queue; signing into the original account online unlocks recovery. When disconnected, revocation cannot be discovered until a request reaches the server, so cached data is a working snapshot and does not establish continuing authorization.

Logout requires a connection and either an empty acknowledged queue or an explicit **Discard pending changes and sign out** choice. Local data is removed under the same cross-tab synchronization lock as logout. Other tabs hide the old account. If someone bypasses logout and signs into another account, the prior account's queue stays isolated and locked until the original account signs back in; it is never uploaded as the new user. No password or session token is stored in IndexedDB, localStorage, or the generic shell. Browser storage is private to the origin/profile, not encrypted against someone who controls that browser or its developer tools; use separate OS/browser profiles for mutually untrusted people.

Shoply requests persistent storage after a local mutation and checks the browser's persistence result. This is a best-effort eviction reduction, never a guarantee. Browser clearing, eviction, profile loss, or device loss can permanently remove unacknowledged changes. Server data can rebuild an acknowledged snapshot, but cannot recover changes it never received. Keep SQLite, sync records, and photos together in server backups.

### Protocol and conflicts

The internal version-1 protocol uses same-origin authenticated POSTs to `/api/offline` for snapshots and one operation at a time. Snapshot POSTs also avoid the generic GET caches of older workers during upgrades. A GET snapshot is available for authenticated diagnostics. Responses are `private, no-store`; POSTs require JSON, the exact request origin, a custom protocol header, and a streaming 64 KB body limit. Reverse proxies must preserve the public scheme/host/origin consistently. Request/session failures leave the queue intact. Retryable network/server failures back off to roughly one minute; startup, becoming visible, browser online events, manual retry, and a foreground timer provide recovery without Background Sync. Browser online/offline hints alone do not establish reachability.

SQLite applies the mutation, history, session effects, image-deletion intent, local/server identity mapping, and idempotency receipt in one transaction under a write lock. UUID operation IDs stay stable across retries; a repeated ID with altered content is rejected. A lost response is retried against its stored result. Web Locks serialize tabs; an IndexedDB lease is the fallback, with server receipts/dependency checks protecting expired-lease overlaps. The queue drains in order, stopping at an operation that needs a decision. Completion is a group of individually acknowledged item operations, so earlier success survives a later conflict.

Database triggers version item fields and lifecycle transitions from **all** write paths, including older Server Actions and administration. Tombstones preserve deletion history. Different-field edits merge when the lifecycle is compatible; equal effective field edits are satisfied without overwriting other fields. Different edits to the same field retain the local patch and shared value for explicit review. Version checks detect change-away-and-back sequences. The same effective check in the same lifecycle is a no-op that preserves original attribution, history, and notification intent. A later check cycle, incompatible check/uncheck, archive/completion change, changed deletion target, removed category, or revoked permission blocks the intention rather than recreating/deleting/overwriting silently.

The panel offers **Use shared state**, **Apply my change to latest state**, or, for an ambiguous addition, **Keep as separate item**. Resolutions receive a new durable operation ID and preconditions bound to the exact shared values shown for review. They conflict again if those fields change while the user decides; background refresh cannot silently weaken that check. Deleted items are never recreated by an edit resolution. Completed items require explicit restoration from the archive before unchecking. Choosing the shared result for one operation does not silently discard later dependent intentions; those are checked independently. Exports retain the original intention when no useful automated resolution is possible.

Numeric quantities merge only for a duplicate actually seen by the device, with matching unit/note and unchanged duplicate version. Retries cannot add the quantity twice. An unseen concurrent addition remains a separate item; a changed intended duplicate requires review. Members keep the default category and may rename only their own items; only admins may move items between categories.

**Finish shopping** captures only the device's checked unfinished item identities, including auto-archived checks, and their preconditions in one local transaction. It never replays the unrestricted legacy completion action. Changes to a captured item's relevant version create an item conflict. The identical check already completed elsewhere can be satisfied as a no-op. Items added/checked later remain untouched, including their photos. Image detachment and completion commit together; physical image cleanup runs after the transaction and retries through normal image maintenance. Delayed checks suppress shopping-started pushes but retain history/session bookkeeping. Live push delivery is at most one attempt, with possible omissions after crashes or provider failures.

### Migrations and deployment updates

`src/lib/db.ts` applies `db/offline.sql` transactionally after existing item-column migrations on first server access. It is idempotent for existing and fresh databases, initializes versions for existing items, and adds `offline_accounts`, `sync_receipts`, `sync_item_links`, `item_versions`, and item triggers. It does not rewrite existing shopping data. Receipt IDs, identity links, and tombstones currently have **no time-based retention limit**: do not truncate them while devices may still retry. They consume disk over time. Future retention requires an explicit device/queue invalidation protocol. Restoring an old server backup can remove acknowledgements and break retry guarantees; recover device queues against the restored state deliberately rather than assuming idempotency survived a database rollback.

Builds give the generic shell a new precache revision and precache the build's first-party assets. New workers wait while existing clients use the previous build. **Update Shoply** activates a waiting worker and reloads open Shoply windows; submitted local work is durable, but finish typing any unsaved form text first. Normal activation also occurs after old clients close. The new worker removes the previous generic runtime caches, serves list/archive from its matching generic shell, and never runtime-caches private responses. Keep old deployed assets available during the transition where possible; a browser without enough storage or an incomplete worker installation cannot promise offline startup. The current private schema/protocol rejects unsupported versions without deleting pending work.

### Reproducible offline tests

Use a supported Node LTS runtime compatible with the pinned native `better-sqlite3` dependency (Node 20/22; Node 26 does not build that dependency). Run:

```sh
npm ci
npm test
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright starts the **production** build on localhost:3107 using a new throwaway SQLite database under ignored `.npm-cache/offline-e2e-*`; it never points at your normal `DATA_DIR`. The suite uses test-only accounts and mocked/local side effects. Browser tests include persistent-profile close/reopen, worker-controlled offline navigation, reloads, persisted mutations, a second client, lost committed responses, conflicts, completion, sessions, tab/account isolation, storage failures, shell-only fallback, and worker activation. Chromium offline emulation can leave worker requests online after browser restart, so the tests explicitly abort worker-owned API requests too and check that offline mutations have not reached SQLite. No production database, external push provider, OS-installed PWA launcher, physical phone, iOS/Safari, Firefox, or production deployment is established by these checks.

## Server Actions

Server Actions support administration and legacy online callers. Shopping components use the authenticated same-origin `/api/offline` protocol described below; this is an internal versioned API, not an unauthenticated integration API.

| Action | Purpose | Authorization |
| --- | --- | --- |
| `loginAction` / `logoutAction` | Create or destroy a session | Public / signed-in |
| `addItemAction` | Add an item, apply eligible defaults, and merge eligible duplicates | Signed-in |
| `checkItemAction` / `uncheckItemAction` | Check or reactivate an item | Signed-in |
| `undoCheckItemAction` | Undo a check, including its archive state | Signed-in |
| `moveItemAction` | Move an item and update its remembered category | Admin |
| `updateItemAction` / `deleteItemAction` | Edit item details or delete an already checked/archived item | Signed-in |
| `rememberCategoryAction` | Set and remember an item's category from the detail dialog | Admin |
| `completeShoppingAction` | Finish checked items, including auto-archived items, and remove their images | Signed-in |
| `registerPushSubscriptionAction` / `deletePushSubscriptionAction` / `sendTestPushNotificationAction` | Manage and test the current user's browser push subscription | Signed-in |
| `suggestItemsAction` | Return autocomplete suggestions from item history | Signed-in |
| `getRevisionAction` | Return the current revision counter for polling | Signed-in |
| `restoreItemAction` | Return an archived item to the list | Signed-in |
| `createCategoryAction` / `renameCategoryAction` / `deleteCategoryAction` | Manage categories | Admin |
| `createUserAction` / `resetPasswordAction` / `deleteUserAction` | Manage household accounts | Admin, with additional safety guards |
| `updateSettingAction` | Change checked-item behavior | Admin |

The suggestion action returns up to eight history matches ordered by usage count. The recent-items action displays up to ten entries ordered by last use. For member accounts, suggested category names are masked as “Uncategorized.”

Actions accept form data or identifiers and return action state, a boolean, a number, a suggestion list, or no value depending on the operation. Validation and authorization errors are surfaced through the relevant form state. Simultaneous attempts to check an item use a database condition on `status = 'ACTIVE'`, making later attempts a no-op.

## Web Push and shopping sessions

Shoply optionally uses standard Web Push with VAPID. Configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and optionally `VAPID_SUBJECT` at runtime; the subject defaults to `mailto:contact@itsmarian.dev`. The private key is read only by server code and is never passed to the browser, service worker, logs, or build output. The public key is passed to the signed-in browser only on `/settings`, where the user can deliberately activate notifications.

Push controls are available to every signed-in user under the separate `Notifications` category on `/settings`. Activation checks browser support, requests notification permission, waits for the Serwist service worker, reuses or creates a `pushManager` subscription, and saves it for the authenticated user. The same category offers a test notification. Deactivation unsubscribes the local browser and removes only that user's endpoint on the server. Browsers without Push API support receive an explanatory message. Production requires HTTPS; localhost is supported for local development. On iOS/iPadOS, Web Push requires an installed Home Screen PWA (16.4 or newer).

The first successful check starts one global `shopping_sessions` row. A live check may send one `shopping-session-started` notification to other users' subscriptions. Delayed/offline checks retain session/history effects but suppress stale shopping-started pushes. Retries never attempt the same push twice; delivery remains best-effort, so a crash after the transaction and before sending can omit a push. Undo does not undo session/history effects. Scoped shopping completion ends the session only when no checked unfinished items remain, preserving another member's later shopping activity. The legacy unrestricted Server Action remains available to existing server callers. Sessions idle for 60 minutes close lazily on the next successful check.

## Temporary item images

Open an item's detail dialog to upload or replace its photo. Every signed-in member can view images; only admins see the image-removal control. Rows without images keep their compact layout. Photos also remain visible in the archive while an automatic check is still reversible.

“Finish shopping” completes the checked unfinished identities captured in the device's view, including those moved straight to the archive by the auto-archive setting, subject to server preconditions. Its control remains visible when all checked items are auto-archived. Checking, unchecking, undo, and restoring an unfinished auto-archived item preserve photos. Completion removes only the included items' photos and prevents a stale check-undo from reopening the completed trip. A shopping notification-session timeout does not complete a trip or delete photos. Restoring an item from a completed trip starts without its old photo; deleting an item also queues its photo for cleanup. History/autocomplete never retain images.

Admins open **Images** below **Categories** in the admin area. This page lists thumbnails, associated item names, file sizes, total disk usage, and a quota slider from 100 MB to 10 GB (decimal units), defaulting to 1 GB. Lowering the quota preserves existing images and pauses uploads if usage exceeds it. Full storage disables upload/replace controls and asks members to contact their organization administrator. The server rejects uploads whose compressed size would cross the limit, including the old file during replacement until it is actually deleted. Older attachments are never evicted to make room.

Uploads accept still JPEG, PNG, and WebP content up to 10 MiB, 8192 pixels per dimension, and 40 megapixels. The server bounds the multipart body even without `Content-Length`, verifies image format by decoding the bytes with Sharp, rejects damaged/animated content, applies orientation, strips embedded metadata, and re-encodes to WebP at quality 80 with a maximum dimension of 1200 pixels. Client filenames and MIME declarations do not control filesystem paths or determine validity. Generated UUID filenames stay under the persistent data directory. Authenticated reads use `private, no-store`; the service worker bypasses image caching.

Disk writes, quota checks, and reconciliation share a SQLite write lock. New files are flushed before their association commits; a failed database transaction removes the new file and preserves the previous association. Item completion/removal and image-detachment commit a durable deletion queue before any physical removal. Cleanup retries on authenticated revision polling, list/archive/admin-image loads, uploads, and reads. Reconciliation removes interrupted-upload files without committed metadata, clears records for missing files, and measures actual on-disk bytes (including files awaiting deletion). Failed deletions remain counted and visible to admins. Cleanup is lazy: while the server is idle or stopped, queued deletions await the next authenticated interaction. Back up/restore the complete `DATA_DIR` together so the database and photos remain consistent.

Push delivery happens after the item transaction commits. Missing VAPID configuration, provider errors, or an invalid recipient cannot make the item check fail; HTTP 404/410 subscriptions are removed automatically. Push is optional and checking items continues to work when it is disabled or unavailable.

## Routes and interface

| Route | Purpose |
| --- | --- |
| `/` | Redirects signed-in users to `/list` and others to `/login` |
| `/login` | Account-name selector and password form |
| `/list` | Main categorized shopping list |
| `/archive` | Archived items with restore controls |
| `/settings` | Personal notification settings, activation, test notification, and unsubscribe |
| `/admin` | Settings, categories, and account management |
| `/admin/images` | Admin-only photo management, storage usage, and quota |

Protected pages share a header with the current user's name and role, admin navigation where applicable, and logout. The interface uses a dark, mobile-first layout with a maximum content width of about 640 px. It uses green for the brand and focus states, amber for checked/archived items, and red for destructive actions.

Page navigation uses the View Transitions API when available and a CSS animation fallback otherwise. Reduced-motion preferences disable transitions. The item detail editor is a bottom sheet; it closes with its close button, Escape, or an overlay click and returns focus to its trigger. The undo snackbar announces status changes with a polite live region.

List/archive reconciliation overlays pending local operations on incoming snapshots, avoiding replacement of unsent intent. Admin image management retains revision-based refresh. A completion bar appears when unfinished checked items are present, including auto-archived items. Empty states are provided for the list, archive, admin categories, and stored images.

## Accessibility

The UI uses semantic page structure, form labels, accessible names and titles for icon-only controls, focus-visible styles, keyboard controls for the category move menu, and ARIA roles for the item combobox, dialogs, listbox, and status messages. The item-entry combobox supports arrow-key navigation, Enter, Escape, and Tab, and exposes its active suggestion with `aria-activedescendant`. The detail dialog uses `aria-modal` and `aria-labelledby`, moves focus to the quantity field when opened, and returns focus to the trigger when closed. Reduced-motion settings disable view-transition and fallback animations.

Known limitations from static review:

- The move menu's options use a static `aria-selected="false"` and do not expose the active option with `aria-activedescendant`, so screen-reader users may not hear the current selection reliably.
- Some login/admin form errors do not use an explicit live region.

## Authentication and security

The login flow looks up the selected account, verifies its bcrypt password, and creates a session. Sessions use a cryptographically random 32-byte token stored in SQLite and in the `shoply_session` httpOnly cookie. The cookie uses `sameSite: "lax"`, `path: "/"`, and a 30-day expiry. `getCurrentUser()` validates the token and expiry and removes expired sessions. Logout deletes the session and cookie. Password resets invalidate the affected user's existing sessions.

The `MEMBER` role can add, check, undo, reactivate, edit details, and delete checked or archived items. Members cannot change categories. The `ADMIN` role can additionally manage categories, accounts, and settings, and can move items between categories. Authorization is enforced in Server Actions and protected pages; middleware is only a fast cookie-presence redirect.

Safety rules include:

- An admin can reset their own password and member passwords, but cannot reset another admin's password.
- Users cannot delete their own account; the last admin cannot be deleted. Member accounts can be deleted through the admin UI; other admin accounts can only be removed through the container's `/delete <Account-Name>` command.
- Passwords are stored as bcrypt hashes, never in plaintext. Generated passwords use an alphabet that omits ambiguous characters and are shown once at account creation/reset or printed during first-time seeding.
- Inputs are trimmed and length-limited in server-side library functions, in addition to client-side form limits.
- No explicit CSP, HSTS, or other security headers are configured in the app.

The cookie's `secure` flag is enabled only when `COOKIE_SECURE=true`. The example file sets it to false, and both Compose files pass the variable through to the container. Set it to true when the app is served over HTTPS. A TLS/reverse-proxy configuration is not included in this repository.

Other security and operational limitations:

- There is no rate limiting or login brute-force protection in `loginAction`.
- The Compose files do not configure TLS or a reverse proxy; production deployments need HTTPS at the host or proxy.

## Configuration

The root `.env.example` contains the settings normally needed for a deployment. The application and Compose files also read the following runtime settings:

| Variable | Purpose | Default / notes |
| --- | --- | --- |
| `ADMIN_NAMES` | Comma-separated administrator account names created by seeding | Required for initial admin accounts |
| `MEMBER_NAMES` | Comma-separated member account names created by seeding | Needed to seed member accounts |
| `PASSWORD_LENGTH` | Length of generated initial passwords | `64` |
| `DEFAULT_CATEGORIES` | Optional comma-separated starting categories | Empty |
| `DATA_DIR` | Directory containing the SQLite database and item image files | `./data` locally; `/data` in Docker |
| `PORT` | Host port published by Compose; Next.js uses container port 3000 | `3000` |
| `DATA_VOLUME_PATH` | Host directory for the Linux Compose variant | `./data` |
| `COOKIE_SECURE` | Controls the cookie's `secure` flag | `false` in the example |
| `FONTAWESOME_HOST` | Full URL to the hosted Font Awesome Pro `all.css` or `all.min.css` stylesheet | Required to load Font Awesome; blank disables its stylesheet |
| `GEMINI_API_KEY` | Server-only Gemini API key for shopping-list scans | Optional; required to use scanning and never exposed to the browser |
| `GEMINI_MODEL` | Gemini model used for shopping-list scans | `gemini-2.5-flash` |
| `VAPID_PRIVATE_KEY` | Server-only private key for Web Push | Optional; never expose to clients |
| `VAPID_PUBLIC_KEY` | Public Web Push application server key | Optional; required to activate Push |
| `VAPID_SUBJECT` | VAPID contact subject | `mailto:contact@itsmarian.dev` |
| `NEXT_TELEMETRY_DISABLED` | Disables Next.js telemetry | `1` in the Docker image |
| `NODE_ENV` | Runtime mode | Set to production in the Docker image |

Docker Compose reads the root `.env` file for variable substitution and passes the VAPID variables, Gemini variables, `FONTAWESOME_HOST`, and `COOKIE_SECURE` into the app container. Set `GEMINI_API_KEY` only in the deployment environment (do not commit it); Shoply keeps it on the server and sends uploaded images directly to Gemini without storing them. Set both VAPID keys in the deployment environment (do not commit them); set `VAPID_SUBJECT` only if a different contact is desired. Production also needs HTTPS at the host or reverse proxy. The default `docker-compose.yml` mounts `./data` at `/data` and maps host port `PORT` (default 3000) to container port 3000. `docker-compose.yml-linux` uses `DATA_VOLUME_PATH` for the host volume, with `./data` as its fallback.

## Installation and development

### Local development

1. Install Node.js 20 or newer.
2. Set `ADMIN_NAMES` and `MEMBER_NAMES` in the shell environment. The seed script reads `process.env` directly; it does not load `.env` on its own.
3. Install dependencies and initialize the database:

   ```powershell
   npm ci
   npm run seed
   ```

4. Start the development server:

   ```powershell
   npm run dev
   ```

The seed script is idempotent. It applies `db/schema.sql` and creates the default category, any optional starting categories, and accounts. The database defaults to `data/shoply.db`.

### Docker Compose

For a standard local or single-host deployment:

1. Copy `.env.example` to `.env` and set account names.
2. Start the service with `docker compose up -d --build`.
3. Read initial generated passwords from `docker compose logs shoply`.
4. Open port 3000, or change the published host port with `PORT`.

Use the alternate Linux Compose file when the persistent host directory should be set with `DATA_VOLUME_PATH`:

```sh
docker compose -f docker-compose.yml-linux up -d --build
```

The application stores its database inside the mounted `/data` directory. Back up the database by stopping the container and copying the persistent data directory.

The production image also provides two administrative container commands:

```sh
docker compose exec shoply /resetpasswords
docker compose exec shoply /delete "Account Name"
```

`/resetpasswords` generates new passwords for every account and invalidates all existing sessions. `/delete` interactively deletes one account and refuses to remove the last administrator. Store generated passwords securely; they are printed only once.

### Package scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `next dev` | Start the development server |
| `build` | `next build` | Build the production app and generate `public/sw.js` |
| `start` | `next start` on the configured port (default 3000) | Start the production server |
| `seed` | `node scripts/seed.cjs` | Idempotently create schema, accounts, and categories |
| `test` | `vitest run` | Run the Vitest suites |
| `lint` | `eslint . --max-warnings=0` | Run ESLint without warnings |
| `typecheck` | `tsc --noEmit` | Check application and test types |
| `test:e2e` | `playwright test` | Run production offline Chromium tests in an isolated database |

## Testing and CI

Run the automated tests with:

```sh
npm test
```

The Vitest suites cover item/history behavior, validation, push subscription ownership and upserts, session start/end/timeout, one-shot notification triggering, multiple devices, initiator exclusion, invalid endpoint cleanup, delivery failures, undo, and missing VAPID configuration. Web Push is mocked; tests never call an external push provider. Tests use an in-memory SQLite database loaded from `db/schema.sql`; they do not require the local data file.

The repository includes `.github/workflows/ci.yml`. On pushes and pull requests, GitHub Actions runs Node.js 20, installs dependencies with `npm ci`, then runs:

```sh
npx tsc --noEmit
npm test
npm run lint
npm run build
```

The manual admin-guard verification script is `scripts/verify-admin-guard.ts`. It checks password-reset restrictions and password hash updates against a throwaway database:

```sh
DATA_DIR=/tmp/shoply-guard-test npx tsx --import ./scripts/register-test-hooks.mjs scripts/verify-admin-guard.ts
```

Production Chromium browser tests live in `e2e/offline.spec.ts`. After UI changes, also check admin guards, keyboard navigation, focus return, screen-reader output, and physical installed devices; automated desktop browser tests do not verify those devices.

## Deployment and operations

The Dockerfile uses three stages based on `node:20-bookworm-slim`: a dependency stage with the native build tools required by `better-sqlite3`, a builder stage that runs `next build`, and a small runtime stage. The runtime image sets `NODE_ENV=production`, `DATA_DIR=/data`, and `NEXT_TELEMETRY_DISABLED=1`. The entrypoint initializes the data directory and drops privileges to the unprivileged `shoply` account before starting the app.

The default Compose service uses `restart: unless-stopped` and a relative persistent data volume. The Linux variant uses `restart: always` and allows a custom host data path. Both expose container port 3000. Neither file includes a health check, reverse proxy, or TLS configuration. Logs go to standard output; the initial generated passwords are included in seed output.

## Known limitations and technical debt

| Priority | Finding | Impact / location |
| --- | --- | --- |
| Medium | No rate limiting for login attempts | Brute-force protection is not implemented; `src/app/login/actions.ts` |
| Medium | No TLS, reverse proxy, monitoring, or health check is configured | Production network and operations setup must be supplied separately |
| Medium | Font Awesome icons do not load unless `FONTAWESOME_HOST` is configured | Set it to a hosted `all.css` file; its host must serve the webfonts and allow cross-origin font requests |
| Low | `archiveItem()` is exported but not connected to a Server Action or UI | Manual archive action from the active list is unavailable; `src/lib/items.ts` |
| Low | `--spl-font-display` names “Shoply Display,” but no matching font face or asset was found | Falls back to a system font; `src/app/globals.css` |
| Low | Move-menu options expose a static `aria-selected="false"` | Active choice may not be conveyed reliably to screen readers; `src/components/ItemRow.tsx` |
| Low | Undo snackbar may appear after a race-condition no-op | Its undo action then has no effect; `src/app/list/actions.ts` and `src/components/ItemRow.tsx` |
| Low | History retains the old category name after a category is deleted | The category ID is set to null, but the text snapshot remains; `db/schema.sql` and `src/lib/items.ts` |
| Low | Physical-device coverage | Desktop Chromium automation does not verify installed iOS/Android apps or other browsers |

`.dockerignore` excludes local environment files, database files, build output, logs, caches, and Git metadata from the Docker build context, while keeping `.env.example` available to Compose.

## Notes for future contributors

- Put new route actions in `src/app/<route>/actions.ts` and keep UI components under `src/components/`. Put reusable business logic in `src/lib/`.
- Every Server Action must perform the appropriate `requireUser()` or `requireAdmin()` check, validate inputs, and revalidate affected paths after writes.
- Keep database schema creation in `db/schema.sql` and update the idempotent migration in `src/lib/db.ts` when adding columns to existing databases.
- Category deletion must remain transactional: move items to the default category before deleting the category because the item foreign key uses `ON DELETE RESTRICT`.
- Keep `server-only` imports in server-side library files. Do not move authoritative session checks into middleware; Edge middleware cannot query this SQLite database.
- `item_history` is updated by checking or moving an item, not by adding it. Preserve the rule that members always add items to the default category.
- Do not loosen duplicate merging: both quantities must be numeric, and unit and note must match (two `null` values count as a match).
- Every write that should be visible to other users must call `bumpRevision()` so `AutoRefresh` can detect it.
- Keep undo events on `window.__shoplyUndoStack` instead of adding a second global state mechanism.
- The auto-archive setting is read when an item is checked; changes to the setting are not retroactive. Preserve the active-status race guard on item writes.
- `public/sw.js` is generated by Serwist. Edit `src/app/sw.ts` and run `npm run build` after changing precached assets; never edit the generated file by hand.
- Keep Font Awesome Pro files out of Git. Configure `FONTAWESOME_HOST` as the full URL to a separately hosted Pro `all.css` file.
- After changes, run `npm run build`, `npm test`, `npm run lint`, and `npx tsc --noEmit` as appropriate. Exercise keyboard and offline behavior in a browser when changing the relevant UI.

## Analysis scope

On 2026-11-02, all 140 Vitest tests, ESLint, typecheck, and the production build passed. All 20 production Chromium browser cases passed, with focused reruns for real-photo placeholders and the final legacy-tab worker-update path. See [offline validation](docs/offline-validation.md) for exact run order, the acceptance matrix, environment details, preserved work, and explicit verification limits. Physical installed devices, other browsers, live push delivery, external deployments, TLS/proxy configuration, and operational backup restoration were not verified.

The local `.env` and SQLite database files were not inspected. Verify the deployment's Font Awesome host, cross-origin font access, TLS, and backup setup separately. Font Awesome Pro assets are commercial and excluded from Git; confirm that the hosted-file setup complies with the applicable Pro license.

## License

Shoply is licensed under the MIT License. See [LICENSE](LICENSE). Font Awesome Pro is a separate commercial asset, is not covered by the project's MIT license, and is excluded from Git.
