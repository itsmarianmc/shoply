# Offline mode validation — 2026-11-02

The implementation uses the existing shopping components in both connected and disconnected operation. No production deployment or external database was changed.

## Results

| Check | Result |
| --- | --- |
| `npm test` | **140 passed**, 16 suites, including all existing tests |
| `npm run lint` | Passed, zero warnings allowed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; generated the production Serwist worker |
| `npx playwright test --reporter=line` | **20 passed**, 3.3 minutes, production server |
| Strengthened real-photo/storage browser case | **1 passed**, 8.5 seconds; rerun after adding a real image upload and explicit placeholder assertion |
| Final legacy-tab worker-update browser case | **1 passed**, 10.0 seconds, against a rebuilt production app after the final update-path fix |
| `git diff --check` | Passed |

Local environment: Windows, isolated Node **22.23.4**, Next.js **15.5.25**, Playwright **1.64.1**, Chromium **156.0.8078.4**. The machine's default Node 26 could not compile the pinned `better-sqlite3` dependency; the test runtime was installed under ignored `.npm-cache/node22`. Browser execution required local socket/browser access outside the restrictive command sandbox. All checks above completed successfully there. Next.js emitted a non-fatal workspace-root warning about a separate parent `package-lock.json`; that parent file was not changed.

The full 20-case run preceded the final narrow legacy-tab update fix. That fix was followed by a new production build and the strengthened update case, which explicitly removes a legacy tab's reload listeners and verifies the worker refreshes it while retaining queued work. The full suite was not repeated after that final focused change. Worker reload intent lives in a small generic cache record because workers can restart between events; refresh waits until activation completes and a new shell announces readiness. This record contains no account data.

The browser harness creates a fresh SQLite database under `.npm-cache/offline-e2e-*`, seeds two test-only accounts, and starts the actual production Next.js build on localhost:3107. Tests never point at the application's normal data directory. Browser profiles, traces, screenshots, test databases, and dependency caches are ignored.

## Acceptance coverage

| Requested case | Evidence |
| --- | --- |
| 1. Offline close/reopen and `/list` reload | A real Chromium persistent profile is closed, reopened offline, and navigated/reloaded through the cached worker shell. |
| 2. Archive offline reload and return/back/forward | Production browser test navigates list/archive, reloads each, and exercises history navigation. |
| 3. Offline add/edit/reload/reconnect/second client | Browser test verifies SQLite has no offline item before reconnect, then another signed-in client sees the final item. |
| 4. Offline item identity and ordered dependent operations | Browser and SQLite tests cover create/edit/check/undo/complete, plus create/check/delete before synchronization and offline archive restoration. |
| 5. Server commit with lost response and retry | Browser intercept forwards the operation to the server, then drops its response. Quantity merge remains single. SQLite/HTTP tests separately verify check history, session creation, one-shot notification attempts, and rollback if receipt persistence fails. |
| 6. Two users checking the same item | Browser and server tests preserve the first checker's attribution and exactly one history increment/session effect. |
| 7. Independent/same-field changes and durable resolution | Browser/server tests merge independent fields, preserve both conflicting values across reload, refresh a newer background snapshot, and require a second review if shared state changed while deciding. Version tests also cover change-away-and-back. |
| 8. Remote deletion/completion versus offline edit/uncheck | Separate browser tests retain the edit and dependent uncheck across reload; shared acceptance does not discard later intentions or recreate deleted items. |
| 9. Scoped offline completion | Browser test excludes a later check. SQLite tests also exclude later additions, preserve another active shopping session, retain photos on a conflicting item, and preserve partial successes. |
| 10. Both checked-item settings | Production browser and server tests cover `KEEP_IN_LIST` and `ARCHIVE`, undo, auto-archived checks, and completion. |
| 11. Session expiry/revocation and role changes | Browser tests revoke sessions while work is pending and recover after login; a role downgrade blocks a queued category move. HTTP/auth tests check expiry, revoked sessions, fresh roles, account binding, and rejected mutations. |
| 12. Account isolation and multiple tabs | Browser tests append from two tabs, require explicit discard at logout, hide the old account, retain a locked original queue across a different-account login, then recover under the original login. IndexedDB tests serialize concurrent appends and exercise lease exclusion. |
| 13. Missing/full/unavailable/corrupt storage | Browser tests inject unavailable IndexedDB and a full-store write failure, showing explicit unsaved status. Storage tests prove aborted writes preserve old data and unknown/corrupt schemas are retained. Startup without a usable snapshot shows a fallback. |
| 14. Worker update and no prior setup | Browser test changes the served production worker, observes waiting activation, activates/reloads, refreshes a simulated legacy tab without reload listeners, and reopens offline with pending work intact. A shell-only profile explains the online-setup requirement; cache inspection excludes authenticated list/archive/login/API responses. |
| 15. Online-only restrictions and image placeholders | Browser tests use a real uploaded photo, verify its offline placeholder and disabled image/scan controls, and verify an already-open admin page becomes unavailable offline. |
| Accessibility interactions | Browser test covers keyboard entry, detail-sheet focus/Escape/return, saving, undo, category-menu navigation, and reload with reduced motion enabled. Live regions, existing mobile styles, and native details controls remain in use. |

Chromium page-level offline emulation can leave a restarted service worker's requests online. Tests therefore also abort worker-owned sync requests and verify server state before reconnect. This avoids passing an apparently offline test that was still mutating SQLite online.

## Limits and operational considerations

- An OS-installed PWA launcher, physical iOS/Android devices, Safari, Firefox, screen-reader speech output, a live push provider, TLS/reverse-proxy setup, and a real multi-build deployment rollout were **not** verified. The worker-activation test uses the local production build; it is not a production deployment test.
- Offline startup requires a successfully installed worker/assets and an account snapshot in the same browser/profile. A completely new device without a worker cannot load an application-provided fallback without network access.
- Browsers may evict or clear storage despite persistence requests. Unacknowledged work that disappears while the app is closed cannot be recovered from the server. Exports are private recovery references, not automatic imports.
- Known expired/revoked sessions lock the view and keep pending work. Offline clients cannot discover revocation until contacting the server. A missing/expired cache-selector cookie requires online login again, even if a private record remains in IndexedDB. Recreating a deleted account does not inherit its old queue.
- `db/offline.sql` is an idempotent server migration applied after legacy column migrations. It adds versions/tombstones, account identities, links, and durable receipts. Receipts/links/tombstones have no automatic retention expiry and need disk capacity planning. Server backups must preserve them with the database/photos; rollback to an older backup can lose idempotency evidence.
- Push delivery remains best-effort and at most one attempt. Delayed offline checks suppress pushes while retaining session/history effects. Actual provider delivery was mocked or absent in test databases.
- Synchronization stops at the first operation needing review, preserving global queue order. Independent later changes wait until that problem is resolved. Completion already acknowledged before a later conflict remains completed.

## Existing work preserved

The initial worktree already reported modifications to `build.sh`, `src/app/globals.css`, `src/app/list/actions.ts`, `src/app/list/page.tsx`, `src/components/AddItemForm.tsx`, `src/components/CategorySection.tsx`, `src/components/CompleteShoppingBar.tsx`, `src/components/ItemDetailDialog.tsx`, `src/components/ItemRow.tsx`, `src/lib/items.ts`, and `tests/items.test.ts`, plus untracked `.gitattributes` and `tests/item-update-actions.test.ts`.

The existing item-name permissions/editing, sticky completion-bar measurement/placement, input styling, and tests were retained and integrated. `build.sh` was not edited. `.gitattributes`, the existing list Server Actions, `CategorySection`, and both existing modified/untracked test files remain byte-identical to their initial saved copies. No files were stashed, reset, committed, or discarded. Initial content backups for the modified shopping files are outside the repository under the chat's visualization workspace.
