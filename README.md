# Shoply

Shoply is a shared household shopping list built with Next.js and SQLite. It runs as a single container with persistent SQLite storage and does not require an external database.

Household members can add, check off, restore, and archive items. Administrators can also manage categories, accounts, passwords, and app settings. The interface is a mobile-first installable PWA. Its service worker caches the app shell and assets, but shopping-list data stays on the server and is not available offline.

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
- Cross-user refresh by polling a revision counter every five seconds. Polling pauses while the browser tab is hidden.
- Installable PWA with a precached app shell and available static assets. List data still requires a connection to the server.
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

Application records stay in server-side SQLite; item image files live in `DATA_DIR/item-images`. The UI reads through Server Components and writes through Server Actions and authenticated image Route Handlers. Font Awesome CSS and webfonts load from the host in `FONTAWESOME_HOST`; without it, the app does not load a Font Awesome stylesheet.

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

There is no client-side state-management library. Components use local state for UI interactions. The one intentional global is `window.__shoplyUndoStack`, which carries check events from `ItemRow` to `UndoSnackbarArea`. Server-rendered lists are revalidated after writes. `AutoRefresh` uses the revision counter to notice writes from other household members.

The TypeScript model also defines `User` and `PublicUser` (the latter omits the password hash), `Category`, `Item`, `ItemWithNames`, `CategoryWithItems`, and `ItemHistory`. Supported units are a fixed list: piece, pack, bottle, can, bag, g, kg, ml, and l.

Schema constraints include unique account and category names, a role check for `ADMIN`/`MEMBER`, at most one default category, and status checks for items. Item category references use `ON DELETE RESTRICT`; user references use `ON DELETE SET NULL`. Session rows cascade when a user is deleted. History category references use `ON DELETE SET NULL` and retain a category-name snapshot. The default checked-item setting is `KEEP_IN_LIST`.

Server-side input validation trims values and applies length limits: item names up to 200 characters, notes up to 500, category names up to 100, and account names up to 50. Quantities must be positive when updated.

The service worker caches the app shell, CSS, fonts, and icons. SQLite data remains on the server, so the PWA does not provide offline list editing or viewing.

## Server Actions

There is no public REST API. Route-level Server Actions provide the app's read/write interactions.

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

The first successful item check starts one global `shopping_sessions` row. The checking user is the initiator; all other users' valid subscriptions receive one `shopping-session-started` notification on each registered device. Further checks, category changes, and undo operations do not create another notification. Undo intentionally does not undo the session or its notification. The existing “Finish shopping” action ends the active session idempotently. An active session with no activity for 60 minutes is closed lazily by the next successful check, allowing a new session to start without sending a timeout notification.

## Temporary item images

Open an item's detail dialog to upload or replace its photo. Every signed-in member can view images; only admins see the image-removal control. Rows without images keep their compact layout. Photos also remain visible in the archive while an automatic check is still reversible.

“Finish shopping” explicitly completes all currently checked, unfinished items, including those moved straight to the archive by the auto-archive setting. Its control remains visible when all checked items are auto-archived. Checking, unchecking, undo, and restoring an unfinished auto-archived item preserve photos. Completion removes only the included items' photos and prevents a stale check-undo from reopening the completed trip. A shopping notification-session timeout does not complete a trip or delete photos. Restoring an item from a completed trip starts without its old photo; deleting an item also queues its photo for cleanup. History/autocomplete never retain images.

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

The list, archive, and image-management page refresh by checking a revision number every five seconds and call `router.refresh()` only after a change; polling pauses while the tab is hidden. A completion bar appears when unfinished checked items are present, including auto-archived items. Empty states are provided for the list, archive, admin categories, and stored images.

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

There are no browser-based end-to-end tests. After UI changes, manually check the admin guards, move-menu keyboard behavior, the detail dialog (open/save/delete, Escape, and focus return), undo behavior, the complete-shopping action, cross-user refresh, and PWA asset caching with the browser offline.

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
| Low | No E2E browser tests | Dialog, undo, PWA, and multi-user behavior are not covered in a browser |

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

This README reflects a static inspection of the repository and its configuration. The workflow and commands above were confirmed from the current files. On 2026-09-17, ESLint, all 43 Vitest tests, and the Next.js production build completed successfully; the build also completed linting and TypeScript validity checks. Browser and device behavior, the production host's TLS/proxy setup, and the operational backup procedure were not independently verified.

The local `.env` and SQLite database files were not inspected. Verify the deployment's Font Awesome host, cross-origin font access, TLS, and backup setup separately. Font Awesome Pro assets are commercial and excluded from Git; confirm that the hosted-file setup complies with the applicable Pro license.

## License

Shoply is licensed under the MIT License. See [LICENSE](LICENSE). Font Awesome Pro is a separate commercial asset, is not covered by the project's MIT license, and is excluded from Git.
