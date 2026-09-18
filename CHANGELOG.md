# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/).

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
