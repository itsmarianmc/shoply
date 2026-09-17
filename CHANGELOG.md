# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-09-17

### Added
Shoply is a shared household shopping list built with Next.js and SQLite. It runs as a single container with persistent SQLite storage and does not require an external database.
Household members can add, check off, restore, and archive items. Administrators can also manage categories, accounts, passwords, and app settings. The interface is a mobile-first installable PWA. Its service worker caches the app shell and assets, but shopping-list data stays on the server and is not available offline.