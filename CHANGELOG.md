# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/).

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
