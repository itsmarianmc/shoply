# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/).

## [2.0.0] - 2026-11-02

### Added
- Integrated local-first shopping-list and archive views using the existing shopping components. After authenticated online setup in the same browser/profile, saved data remains usable across offline navigation, reloads, and browser reopening; first-use and missing-snapshot screens explain when an online connection is required.
- Account-bound IndexedDB storage for item state, categories, checked-item behavior, and useful history/suggestions. Supported mutations wait for an atomic local transaction before reporting success, request persistent storage where available, and explicitly report unavailable, corrupt, unsupported, evicted, or full storage.
- A durable ordered operation queue with stable UUIDs, local/server item identity links, and receipt-based dependencies for items created, edited, checked, undone, completed, restored, or deleted before synchronization.
- An internal versioned `/api/offline` protocol for authenticated snapshots and individual mutations. SQLite commits operation receipts with mutations, identity mappings, history, session effects, and image-deletion intent so retries after a lost response do not repeat durable effects.
- Idempotent initialization through `db/offline.sql`, applied after legacy item-column migrations. New account identities, receipts, identity links, item versions, and deletion tombstones support existing and fresh databases; receipts, links, and tombstones have no automatic retention expiry.
- Field and lifecycle concurrency controls covering existing server write paths as well as synchronization. Compatible independent-field edits merge, equal effective actions preserve existing attribution, and incompatible field, check-cycle, archive, deletion, category, or completion changes remain available for review.
- Durable conflict choices to accept shared state, apply a saved change against the values shown for review, or keep an ambiguous addition as a separate item. Resolution operations receive new IDs and checked preconditions, retain dependent intentions, and cannot silently recreate a deleted item.
- An accessible connection and saved-changes panel with saving, offline, pending, synchronized, and attention states; inspectable operation IDs; manual retry; private recovery-file export; and an explicitly confirmed local-data reset.
- Item-name editing in the detail sheet: members can rename items they added, administrators can rename any item, and both the existing Server Action and synchronization path enforce those restrictions.
- Expanded regression coverage to 140 unit/integration tests and 20 production Chromium browser cases. Added Playwright and `fake-indexeddb` development dependencies, an isolated production test server, `typecheck` and `test:e2e` scripts, and browser checks in CI.

### Changed
- Replaced generic service-worker runtime caching with a precached public `/offline` shell and versioned first-party assets. Authenticated HTML, RSC responses, APIs, and item images remain network-only; private shopping snapshots are stored separately in IndexedDB.
- Service-worker updates wait for activation and provide an offline-readiness check. Explicit updates persist a generic reload intent and refresh older open windows after activation, including clients without a controller-change listener, while retaining locally submitted work.
- Replaced list/archive `AutoRefresh` rendering with snapshot reconciliation that overlays pending local operations. Synchronization runs on startup, visibility and connectivity changes, manual retry, and a foreground timer with bounded backoff; server reachability is checked rather than inferred solely from `navigator.onLine`.
- Finish shopping now captures the checked unfinished identities in the device's view, including auto-archived items, instead of replaying unrestricted server completion. Per-item acknowledgements preserve partial success, incompatible changes become conflicts, only included images are detached, and another member's remaining unfinished items keep the shopping session open.
- Quantity merging requires a compatible duplicate actually seen by the device and an unchanged server version. Stable receipts prevent repeated quantity increases, unseen concurrent additions stay separate, and changed intended duplicates require review.
- Delayed offline checks preserve history and shopping-session bookkeeping while suppressing stale shopping-started pushes. Live notification attempts remain best-effort and are not repeated for an acknowledged operation retry.
- Sign-out now requires a connection and either an acknowledged queue or explicit discard of pending work. Expired/revoked sessions lock the local view without deleting its queue; another account cannot upload it, and signing back into the original account can recover it.
- Administration, settings, AI scanning, and image mutations clearly require a connection, including administration pages that were already open when connectivity was lost. Images use offline placeholders, and essential controls have system-glyph fallbacks without depending on the optional external icon font.
- Moved Finish shopping above category sections and made its bar sticky below the measured header, with narrow-screen wrapping, touch-friendly controls, and scroll offsets that keep focused content visible. Expanded the README and added `docs/offline-validation.md` with setup, migration, retention, backup, storage-loss, account, conflict, test-order, and verification-limit details.

### Fixed
- Reconciled synchronized temporary item identities during subsequent quantity merges, image actions, and dependent operations so the local and server references continue to address one item.
- Preserved an item editor's opening baseline during background refreshes so saving an open sheet does not silently overwrite a field changed while the user was typing.
- Prevented synchronization-driven rerenders from repeatedly extending undo-snackbar timeouts, deduplicated repeated notifications for the same item, and kept snackbars below modal sheets so they cannot cover Save controls.
- Rendered confirmation dialogs through a body-level portal so the sticky header cannot constrain the sign-out/discard dialog outside the mobile viewport; retained focus handling and Escape support.
- Wrapped autocomplete suggestion names separately from quantity labels to preserve their intended spacing and alignment.

### Security
- Synchronization validates the current server session, account ownership, role, item permissions, and operation preconditions. Mutation requests require the same origin, JSON, a custom protocol header, and a streaming 64 KB body limit; reused operation IDs with altered content are rejected.
- Kept the public account cache selector separate from the HttpOnly session credential. No passwords or session tokens are stored in IndexedDB or the generic shell, private responses use `private, no-store`, and account switching and logout isolate or clear local data without silently deleting unsynchronized work.
- Corrected session-expiry checks to compare SQLite date values with `julianday`, rejecting ISO-formatted sessions that expired earlier on the current day.

## [1.2.1] - 2026-10-05

### Added
- An admin-only, application-wide Gemini shopping-list recognition language setting with 20 supported languages, stable language codes, a German default, server-side authorization and validation, and persistent storage.
- A dedicated transparent monochrome Android notification badge so the status-bar symbol uses the Shoply mark instead of the full-canvas app icon.

### Changed
- Set editable text inputs, textareas, and selects to a computed minimum of 16 CSS pixels at every screen size while leaving labels, buttons, and status messages unchanged.
- Improved Gemini shopping-list reading instructions to check each candidate against visible letter shapes and list context, report persistently unreadable lines without guessing, retain unusual readable names, and preserve the language written on the list.

## [1.2.0] - 2026-10-05

### Added
- Temporary item image attachments that signed-in members can upload, replace, and view from the item detail dialog.
- Small square thumbnails to the left of item titles in the shopping list, item detail dialog, and archive while an attachment still exists. Items without images keep their compact layout, and missing thumbnails are hidden gracefully.
- An enlarged image viewer with an accessible close button, Escape handling, and focus restoration to the thumbnail without closing the underlying item dialog.
- An admin-only Images page, linked below Categories with a right-facing arrow, showing stored thumbnails, associated item names, individual file sizes, file count, total disk usage, and individual image deletion.
- An admin-controlled image-storage quota with a 100 MB–10 GB slider and a 1 GB default. Upload controls are disabled at the limit with a message to contact the organization administrator; the server also rejects uploads that would exceed it. Lowering the limit preserves existing images, and older images are never evicted to make room.
- Local image storage under `DATA_DIR/item-images`, with generated filenames and only image metadata and item associations stored in SQLite. Durable deletion queues, serialized storage operations, and disk reconciliation recover interrupted uploads, retry failed deletions, account for files awaiting cleanup, and remove stale records for missing files.
- Tests for image validation and compression, upload limits, authentication and admin permissions, quota enforcement, replacement and deletion failures, interrupted writes, missing files, shopping completion and undo, concurrent upload lifecycle changes, and migration of existing databases. Test storage uses isolated temporary directories with cleanup.

### Changed
- Explicitly finishing shopping deletes attachments belonging to the checked items included in that trip, including items already auto-archived. Checking, unchecking, undoing, notification-session expiry, and restoring unfinished auto-archived items retain their images. Restoring items from completed trips starts without the previous photo; item history and suggestions do not reuse attachments.
- Item deletion also schedules attachment cleanup. Replacement preserves the existing attachment if the database update fails, and old files are deleted only after the replacement is committed. Cleanup failures do not undo completed operations and are retried during subsequent authenticated activity.
- Extended the schema and atomic, repeatable initialization migrations with image metadata, deletion state, storage settings, item completion timestamps, and attachment generations. Existing historical archive entries are marked completed so they are not included in a new shopping trip.
- Image mutations update the shared revision and refresh affected pages. The archive and Images page now refresh automatically, and nested admin pages use the same back-to-list navigation as the main admin page.
- Centered item-dialog thumbnails, titles, and close controls; kept the Images admin link and arrow on one row; and reformatted global styles with consistent indentation and expanded rules.
- Made Sharp a direct production dependency, updated the lockfile, and included it in the Next.js server external packages for image processing.
- Expanded the README with attachment permissions, trip cleanup behavior, quota management, upload limits, storage layout, authenticated routes, backup of the complete data volume, and cleanup retry behavior.
- Added ignore rules for the local npm cache and Linux Compose file, and excluded the npm cache from Docker builds.

### Fixed
- Signed-in users visiting the login page are redirected to the shopping list.
- Finish shopping remains available when all checked items have already been auto-archived, allowing the trip and its image cleanup to be completed explicitly.
- Stale undo actions cannot reopen explicitly completed trips, and uploads started before completion cannot attach an old photo after an item is restored for a future trip.

### Security
- Image reads and uploads require authentication; manual image removal, storage management, and quota changes require an admin. Image identifiers and generated filenames are validated without accepting arbitrary filesystem paths.
- Uploads enforce a bounded multipart body, a 10 MiB file limit, actual JPEG/PNG/WebP content validation and pixel decoding, still-image checks, maximum dimensions of 8,192 pixels per side, and a 40-megapixel limit. Images are orientation-corrected, resized to at most 1,200 pixels per side, compressed to WebP, and stripped of embedded metadata.
- Cross-origin browser uploads are rejected. Image responses use private, no-store caching and content-type protection, and image requests bypass the image optimizer and service-worker cache.

## [1.1.0] - 2026-09-18

### Added
- AI-powered shopping-list scanning from JPEG, PNG, and WebP images using the server-side Gemini integration. Detected item names remain in a local preview until each item is individually confirmed.
- Accessible scan-preview and discard-confirmation dialogs, including keyboard focus management, Escape handling, per-item save errors, and loading feedback.
- Server-side scan response validation, authenticated upload handling, and Gemini configuration through `GEMINI_API_KEY` and `GEMINI_MODEL`.
- Configuration documentation and Docker Compose environment support for the Gemini integration.
- Unit coverage for scan-result validation, upload-route error mapping, and the scanned-item confirmation flow.

## [1.0.0] - 2026-09-17

### Added
Shoply is a shared household shopping list built with Next.js and SQLite. It runs as a single container with persistent SQLite storage and does not require an external database.
Household members can add, check off, restore, and archive items. Administrators can also manage categories, accounts, passwords, and app settings. The interface is a mobile-first installable PWA. Its service worker caches the app shell and assets, but shopping-list data stays on the server and is not available offline.
