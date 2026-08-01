# TPS Notebook Navigator

TPS Notebook Navigator is an experimental, co-installable fork of [Notebook Navigator](https://github.com/johansan/notebook-navigator). It keeps the upstream navigator available while providing a separate place for TPS integrations, provider-rendered rows, and deeper workflow control.

The fork's first integration line is based on upstream commit `2b65be66` (Notebook Navigator 3.3.0 lineage plus upstream changes through that exact commit). The upstream project remains the source for the mature file-browser experience, documentation, translations, icon packs, and media assets. TPS-specific changes are maintained independently in this repository.

## Why this is a separate plugin

The fork is deliberately isolated so enabling, testing, disabling, or removing it cannot replace upstream Notebook Navigator or take over its runtime state.

- Plugin, view, command, icon, event, drag payload, DOM, CSS, Style Settings, local-storage, IndexedDB, and settings-transfer identities use TPS-only namespaces.
- Upstream and TPS Notebook Navigator can be enabled in the same vault and opened side by side.
- Note content, tags, frontmatter, and vault folders remain shared Obsidian data by design.
- Importing upstream settings is explicit, one-way, and read-only with respect to the upstream plugin. It never runs automatically.
- TPS integrations are optional and fail closed: disabling them restores the ordinary file-only navigator behavior.

## BRAT installation

1. In BRAT, choose **Add beta plugin**.
2. Add `ZachTish/tps-notebook-navigator` and use **Latest** for normal updates or **Frozen** to pin a numeric release.
3. Enable **TPS Notebook Navigator** in Community plugins. You can leave **Notebook Navigator** enabled.
4. Open **Settings → TPS Notebook Navigator → TPS integration** to opt into integrations or import a copy of upstream settings.

The release assets are `main.js`, `manifest.json`, and `styles.css`. The minimum supported Obsidian version is 1.11.0.

## TPS integration contract

The integration surface is intentionally modular. The navigator owns presentation and row composition; a provider owns its data and actions. Provider failures are isolated and never block the normal file list.

The initial TPS Global Context Menu provider can show task rows belonging to the exact files already present in the list. It does not scan unrelated folders or invent task files. Completed-task visibility and the per-note row limit are explicit settings. TPS Global Context Menu 1.15.0 is the tested completion baseline: task checkboxes complete or reopen the exact task through GCM's configured status/checkbox rules, selecting the title re-resolves and opens its source line, and right-click, mobile long-press, or **More actions** opens the same guarded GCM task menu available in Types. Custom checkbox markers remain visible instead of being flattened to a binary checkmark. Generic row providers can also add their own synchronous context-menu actions without granting the navigator access to provider internals. Older structurally compatible APIs without a safe task mutation or menu path degrade only that capability. If GCM is disabled, missing, or incompatible, the provider contributes no rows.

### Types navigation

The first-class **Types** section is enabled by default. It uses TPS Global Context Menu's generic Entity Index v3 rather than maintaining a second Markdown parser.

- **Notes**, **Checkboxes**, **Bullets**, and **Headings** are structural collections. **Kinds** is a nested collection built dynamically from every indexed `Kind` value, so note entities and line entities can participate in the same relational model.
- A selected collection replaces the file list with standalone, virtualized entity rows. Selecting a note opens that note; selecting a checkbox, bullet, or heading re-resolves its stable locator and opens the current source line through direct Obsidian APIs.
- Hydrated task entities—both in **Checkboxes** and inside any dynamic Kind—show their live checkbox state. Mutable rows use GCM's canonical completion path with optimistic rollback, and right-click, mobile long-press, or **More actions** opens the full GCM task menu. A task that cannot be matched exactly remains open-only rather than inventing state.
- Task hydration batches cold reads across source files, then reuses a bounded per-path cache keyed by file metadata. Exact GCM and vault update paths invalidate that cache, including failed initial hydration, so unchanged vaults avoid repeated scans without leaving edited checkboxes stale.
- Counts and rows respect the active Navigator profile, hidden-folder/file/property/tag rules, file visibility, and the hidden-items override. Fenced examples that GCM excludes never become Navigator rows.
- Type rows are deliberately excluded from file selection, pinning, drag, rename, sort/group editing, and note creation. The Types list keeps its own text search and hides irrelevant file actions on desktop and mobile.
- Missing, disabled, incompatible, or incomplete GCM indexing fails closed with a visible status row. TPS Global Context Menu 1.15.0 is the tested Entity Index v3 and canonical task-completion baseline. Older GCM builds may populate Types when they expose Entity Index v3, but mutation capabilities are detected independently and fail closed.

The selected type and Types/Kinds expansion state use TPS-namespaced local storage, participate in back/forward history and keyboard navigation, and do not alter upstream Notebook Navigator state. Dynamic Kind collections disappear only after a complete index snapshot confirms that the Kind no longer exists; transient GCM startup does not erase a restored selection.

External integrations can discover built-in, dynamic Kind, and registered-provider descriptors through the provider-neutral
public `types` catalog, subscribe to its availability/revision changes, build or parse opaque Kind ids, and navigate through
`navigation.navigateToType(typeId)`. API 2.7.0 also adds `types.registerProvider(...)`: one runtime registration defines one
or more new top-level Type collections and supplies their rows through the existing guarded row DTO. TPS owns collision-free
opaque ids, visible-path enforcement, timeouts, cancellation, validation, and lifecycle cleanup; the provider owns its data,
search, activation, checkbox changes, and context-menu actions. Provider definitions and options are never persisted.

Clicks, back/forward history, and public calls share one validator, ancestor-expansion, focus, and scroll path. Catalog DTOs
are immutable and intentionally omit GCM records, source paths, task payloads, and counts whose meaning would differ before
and after Navigator visibility filtering. Readiness and removal authority are tracked per source: a failed provider cannot
poison GCM or another provider, a late-loading provider selection is preserved, and explicit unregistration removes a stale
selection immediately. See [the API reference](docs/api-reference.md#registering-a-top-level-type-provider) for a complete
provider example.

### Settings map

The default settings surface remains the normal Notebook Navigator landing page. **TPS integration** is a top-level destination under **Configuration**, one click from that landing page.

- **Task rows** — **Show GCM tasks beneath notes** is off by default. When enabled, the same page reveals **Include completed tasks** and **Tasks per note**; there is no nested editor or second configuration page.
- **Types navigation** — **Show Types in navigation** is on by default and directly controls the first-class Types section. It is a single flat toggle; structural and Kind collections require no nested rule editor.
- **One-way setup** — **Import upstream Notebook Navigator settings** always asks for confirmation. It reads only `.obsidian/plugins/notebook-navigator/data.json`, copies recognized upstream settings into the TPS plugin, preserves TPS-only integration settings, and never writes to upstream state.

The Types toggle and all three task-row values persist in the TPS plugin's own `data.json`. The importer, active route, disclosures, focus, and scroll position do not create extra persisted schema. On mobile, these controls use Obsidian's native stacked setting rows; the optional controls disappear while task rows are disabled so they do not consume the viewport.

### Provider behavior and limits

- Rows are transient UI records, never fake `TFile` objects. They do not participate in file selection, multi-select, drag, rename, or file indexes.
- Providers are queried only for exact paths already present in the current list. Independent providers stream in as they settle, in configured order, without exceeding one global 1,000-row ceiling. During a same-scope refresh, each provider's prior rows remain visible until that provider itself settles, including empty or failed results. Large GCM lists load progressively in bounded 64-note passes, retain completed pass state for the active scope, and cache tasks per path with independent per-note limits and GCM/vault lifecycle invalidation.
- A provider exception is isolated and logged without replacing or blocking the file list.
- A mutable GCM checkbox updates optimistically, rolls back with a visible warning on failure, and refreshes from GCM's file event. Working, holding, and other custom markers render verbatim with an accessible state label. Older compatible GCM APIs retain a labeled display-only checkbox.
- Attached GCM task rows and Type-backed task rows expose the same current GCM task actions. Menu construction and source activation re-resolve the live optional API and fail closed with a visible warning when the task or capability is stale.
- Provider controls own their keyboard and context-menu events, so completing a task cannot accidentally trigger file deletion, selection, or the empty-list menu.
- A provider may expose synchronous row actions through `contextMenu(context)`. The same actions open from desktop right-click, the native mobile long-press context-menu event, or the keyboard-focusable **More actions** button. Failed, asynchronous, and empty builders are isolated and never open a blank menu.
- External providers can opt in to a selected Type collection with `supportsTypeScope: true`. They receive the opaque selected Type id and only the exact visible paths represented by the current searched Type rows; providers that do not opt in retain their previous attached-list behavior.
- A Type provider establishes a new top-level collection through `types.registerProvider(...)`. Its owner-row query receives
  the active search text, an abort signal, and every Markdown path allowed by the current Navigator visibility profile. The
  host rejects rows outside that allowlist; ordinary `supportsTypeScope` row providers may then augment only the exact paths
  represented by accepted owner rows. If both registries emit the same `providerId` plus row `id`, the owning Type row wins
  so the virtualized list cannot contain duplicate keys.
- Type-provider catalogs refresh atomically and independently. Invalid or timed-out refreshes retain that provider's last
  valid descriptors, async results are ignored after replacement/unload, and provider callbacks/options remain runtime-only.
- API lifecycle events announce each available and unavailable host instance. Long-lived owners can subscribe once and send
  a point-to-point lifecycle request, then automatically replace their registration handles after a TPS-only hot reload
  without polling, rebroadcasting a request response, or retaining provider state in Navigator.
- TPS settings import is a copy, not synchronization. Later upstream setting changes are not mirrored unless the import is explicitly run again.
- Built-in GCM-backed Types rows are a separate virtualized source rather than attached provider contributions, so they are not truncated by the attached-provider 1,000-row ceiling. External Type-provider rows retain the public provider safety ceiling. Plain-text search matches built-in entity labels and source paths; external owners receive the same query before their row ceiling. File-only advanced search operators and Omnisearch ranking do not apply in a Types collection.

## Keeping up with Notebook Navigator

Fork-specific integrations live in separate modules and host-global identity is centralized in `src/constants/tpsIdentity.ts`. Inherited source keeps upstream `nn-` CSS/DOM tokens so routine upstream edits merge normally; the test and production build pipelines apply the TPS namespace only at compilation and generated-style boundaries. The same build boundary isolates bundled dnd-kit described-by and live-region IDs, preventing accessibility DOM collisions when upstream and TPS views are open together. The merge-friendly source check rejects accidentally committed runtime prefixes, while the final artifact gate proves that upstream tokens cannot ship. Run `npm run upstream:audit -- <ref>` for a read-only changed-file/conflict worklist, then follow [the upstream sync guide](docs/upstream-sync.md) when merging a later Notebook Navigator tag. A public standalone checkout builds in an explicit build-only mode; the contained test-vault workspace still requires and runs its adjacent atomic runtime deployment hook.

### Merge-friendly namespace maintenance

- `scripts/tps-runtime-namespace.mjs` is the single mechanical transformation used by esbuild, Vitest, and the generated stylesheet builder.
- `npm run tps:namespace:check` verifies inherited source has not been permanently rewritten. `npm run tps:namespace` repairs accidental TPS CSS/DOM prefixes back to their upstream form after a conflict resolution.
- `npm run tps:artifacts:check` verifies the opposite boundary after a build: `main.js` and `styles.css` must contain the TPS runtime namespace and no upstream CSS/DOM namespace.
- This maintenance-only change preserves the exact 4.0.0 runtime bytes while reducing the fork diff from 303 files to 128 files against its current upstream base, including a reduction from 239 to 62 changed files under `src`.

## Release history

### 4.7.1 — complete and discoverable Types navigation

- Removes the external-provider 1,000-row ceiling from built-in Notes, Checkboxes, Bullets, Headings, and GCM Kind
  collections, so their visible count and virtualized result list now describe the same complete set.
- Keeps externally owned and augmenting Type rows under the existing shared 1,000-row safety ceiling, including
  owner-first ordering and duplicate-identity protection.
- Inserts Types immediately after Folders when normalizing a legacy saved navigation order that predates Types, while
  preserving an existing custom Types placement and every other user-ordered section.
- Requires no settings, API, or note-data migration and keeps the minimum supported Obsidian version at 1.11.0.
- Validated with focused large-collection and legacy-order regressions, the full test suite, production build gates, and
  live test-vault verification of the Types placement, five-digit Bullet count, and exact-line Bullet activation.

### 4.7.0 — hot-reload-safe provider lifecycle

- Adds API `2.8.0` with `tps:notebook-navigator-api-changed` availability announcements and a guarded,
  point-to-point `tps:notebook-navigator-api-request` handshake for late-loading integrations.
- Announces unavailability before the current Rows and Types registries are disposed, then announces the replacement API
  only after startup registration completes, so long-lived providers can replace stale handles after a TPS-only reload.
- Isolates malformed, throwing, and rejected consumers from Navigator startup and shutdown; lifecycle callbacks, API state,
  and provider registrations remain runtime-only and are never persisted.
- Strengthens the co-install artifact gate around the host-global Style Settings ID and the actual upstream shortcut drag
  MIME, with fixtures that fail if either upstream identity reappears.
- Requires no settings or note-data migration and keeps the minimum supported Obsidian version at 1.11.0.
- Validated with 205 Vitest files and 2,182 tests plus formatting, ESLint, TypeScript, stylesheet, namespace, and artifact
  gates. The reloaded test vault covered the current API request and a TPS-only disable/re-enable sequence with unavailable
  and available transitions around a new API instance.

### 4.6.0 — externally owned Type collections

- Adds `types.registerProvider(...)` in public API 2.7.0 so integrations can define top-level **Types** collections and supply
  note or line rows without depending on GCM internals.
- Gives providers host-owned opaque ids, async catalog and row cancellation, five-second timeouts, deterministic ordering,
  atomic last-good refreshes, and idempotent options/unload cleanup.
- Applies Navigator visibility before rendering provider-owned rows, forwards the active Type search, hides misleading
  pre-query counts, and preserves activation, checkbox, and context-menu parity through the existing guarded row renderer.
- Tracks readiness and missing-item authority per provider so one failing integration cannot poison another, late plugin load
  cannot erase restored navigation, and explicit removal still falls back safely.
- Requires no settings or note-data migration and keeps the minimum supported Obsidian version at 1.11.0.
- Validated with 202 Vitest files and 2,169 tests plus formatting, ESLint, TypeScript, stylesheet, namespace, and artifact
  gates. The reloaded test vault covered built-in checkbox/bullet activation and an external Type provider's navigation,
  search, checkbox mutation, context-menu action, exact-line activation, and unregister fallback.

### 4.5.0 — programmatic Types control

- Adds a provider-neutral, immutable public catalog for discovering structural and dynamic Kind Type collections without
  importing or depending on GCM internals.
- Adds stable structural ids, Kind id build/parse helpers, immediate live subscriptions, and terminal readiness handling under
  API `2.6.0`.
- Adds `navigation.navigateToType(typeId)` and routes UI clicks plus back/forward history through the same guarded resolver.
- Expands **Types** and **Kinds**, preserves the requested focus mode, scrolls the target into view, and rejects missing ids only
  after a complete authoritative catalog snapshot.
- Requires no settings or note-data migration and keeps the minimum supported Obsidian version at 1.11.0.

### 4.4.0 — task control and isolation parity

- Gives attached GCM tasks the same guarded right-click, mobile long-press, and **More actions** menu as task-backed Type rows.
- Re-resolves current GCM task/menu/navigation capabilities at action time, refreshes when `taskLines` is added, replaced, or removed, and fails closed with a visible warning for stale tasks.
- Preserves custom checkbox markers such as working or holding states instead of replacing every state with blank/✓, including accessible state labels.
- Gives bundled dnd-kit described-by and live-region elements TPS-only ID prefixes so upstream and TPS Navigator views do not emit duplicate accessibility DOM IDs.
- Adds `npm run upstream:audit -- <ref>`, a deterministic read-only changed-file and merge-conflict worklist for future upstream syncs.
- Requires no settings, API, or note-data migration; public API remains 2.5.0 and minimum supported Obsidian remains 1.11.0.

### 4.3.0 — interactive and extensible Types

- Makes task-backed Type rows interactive in both **Checkboxes** and dynamic Kind collections, while unmatched or stale task entities remain safely open-only.
- Uses GCM's canonical configured completion path, validates the effective state before accepting optimistic UI, refreshes after GCM file updates, and exposes the full GCM task menu through a restricted item/separator facade.
- Batches task hydration, retains a bounded 2,048-path LRU keyed by source metadata, and invalidates exact paths on GCM events, native vault edits, and Navigator checkbox mutations so large vaults do not reread every task file on routine refreshes.
- Lets external row providers explicitly opt in to standalone Type scopes without duplicating the built-in GCM task provider or repeating contributions for notes with multiple matching entities.
- Advances the public API to 2.5.0 with `selectionType: 'type'`, opaque `selectedType`, `supportsTypeScope`, and synchronous `addSeparator()` support.
- Corrects provider-row virtualization to reserve 54 px on desktop and 57 px on mobile, with 44 px mobile checkbox, open, and More targets.
- Requires no settings or note-data migration and keeps the minimum supported Obsidian version at 1.11.0.

### 4.2.0 — first-class Types navigation

- Adds an expandable **Types** navigation section with Notes, Checkboxes, Bullets, Headings, and dynamic Kind collections from GCM Entity Index v3.
- Opens note entities directly and re-resolves line locators immediately before opening checkbox, bullet, heading, or Kind-backed line entities at their current source line.
- Applies active Navigator visibility rules to both collection counts and results, keeps selection/history/keyboard/mobile behavior native, and prevents file-only actions from mutating a virtual Types list.
- Adds the default-on **Show Types in navigation** setting without importing or overwriting it from upstream settings.
- Advances the public API to 2.4.0 with a `type` navigation item while preserving existing folder/tag/property/none result shapes.
- Requires no note or settings migration, keeps the minimum supported Obsidian version at 1.11.0, and treats GCM 1.14.0 Entity Index v3 as the tested Types baseline.
- Validated with 195 Vitest files and 2,067 tests, formatting, ESLint, TypeScript, stylesheet and TPS namespace gates, a production build deployed to the test vault, an Obsidian 1.12.7 plugin reload, and live interaction checks for every structural collection plus note-backed and line-backed Kinds.

### 4.1.0 — provider actions and resilient composition

- Advances the public Rows API to 2.3.0 with optional synchronous `contextMenu(context)` actions for any provider row.
- Opens the same guarded actions from desktop right-click, native mobile long-press, or an accessible **More actions** button without exposing the host menu to providers.
- Streams independent providers as each settles while preserving configured order and one true 1,000-row global budget.
- Retains each unresolved provider's prior rows during same-scope refreshes, preventing GCM and external rows from flickering while another provider is slow.
- Preserves GCM checkbox mutation, exact-line activation, ordinary file navigation, and the co-installable TPS/upstream identity boundary.
- Requires no settings or note-data migration and keeps the minimum supported Obsidian version at 1.11.0.

### 4.0.0 — isolated TPS fork

- Establishes a major-version identity and storage boundary from inherited Notebook Navigator 3.x releases.
- Adds the generic provider-row contract and optional TPS Global Context Menu task rows.
- Adds interactive task completion through GCM with a display-only compatibility fallback.
- Keeps large/root task lists responsive with bounded progressive loading, fair per-note allocation, lifecycle-aware refresh, and global/cache safety limits.
- Adds an explicit, one-way import for recognized upstream settings.
- Adds a repeatable upstream merge/namespace workflow so future Notebook Navigator updates can be integrated without rediscovering fork isolation rules.
- Keeps upstream and TPS instances co-installable; no production vault or upstream plugin state is mutated by installation.
- Validates the interactive provider against TPS Global Context Menu 1.13.1, including cross-plugin file identity, exact-line focus, optimistic checkbox mutation, and rollback-safe refresh behavior.
- Tested with the complete inherited Vitest suite, focused fork/integration regressions, typechecking, linting, production build, test-vault deployment/reload, and side-by-side UI QA. Exact results and artifact hashes are recorded in the GitHub release.

## Upstream feature reference

The documentation below describes the inherited Notebook Navigator feature set. Upstream translations and tutorials are available at [notebooknavigator.com](https://notebooknavigator.com/docs.html). TPS-only behavior and release verification are specified in this repository.

![Notebook Navigator Screenshot](https://github.com/johansan/notebook-navigator/blob/main/images/notebook-navigator.png?raw=true)

<!-- DOCUMENTATION_START -->

## 1 Installation

1. **Install Obsidian** - Download and install from [obsidian.md](https://obsidian.md/)
2. **Enable community plugins** - Go to Settings → Community plugins → Turn on community plugins
3. **Install BRAT** - Install the BRAT community plugin, then add `ZachTish/tps-notebook-navigator`
4. **Enable TPS Notebook Navigator** - The upstream `notebook-navigator` plugin may remain enabled at the same time
5. **Install Style Settings (optional)** - For customizing colors and appearance, install [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) plugin by searching for "Style Settings" in Community plugins

<br/>

## 2 Getting started

Here is the official tutorial for learning and mastering Notebook Navigator:

[![Mastering Notebook Navigator](https://raw.githubusercontent.com/johansan/notebook-navigator/main/images/youtube-thumbnail.jpg)](https://www.youtube.com/watch?v=m2maDNtho7Y)

The video has subtitles in 21 languages.

<br/>

## 3 Security and quality

Notebook Navigator is checked with [TypeScript](https://www.typescriptlang.org/), [ESLint](https://eslint.org/) with the official [Obsidian ESLint plugin](https://github.com/obsidianmd/eslint-plugin), [Prettier](https://prettier.io/), [Vitest](https://vitest.dev/) and a production build before changes are merged. The build must complete with zero errors and zero warnings.

Security checks run through [CodeQL](https://codeql.github.com/) in the [TPS fork workflows](https://github.com/ZachTish/tps-notebook-navigator/actions). The inherited upstream implementation is also reviewed through [Notebook Navigator's public repository](https://github.com/johansan/notebook-navigator).

Notebook Navigator runs locally, but some features make documented HTTP requests for updates, downloads, and remote content. See [section 11 - Network and Diagnostics Disclosure](#11-network-and-diagnostics-disclosure) for the full list.

<br/>

## Table of contents

- [4 Documentation](#4-documentation)
- [5 Keyboard shortcuts](#5-keyboard-shortcuts)
- [6 Synced and local settings](#6-synced-and-local-settings)
- [7 Search](#7-search)
- [8 Custom hotkeys](#8-custom-hotkeys)
- [9 Commands](#9-commands)
- [10 Features](#10-features)
- [11 Network and Diagnostics Disclosure](#11-network-and-diagnostics-disclosure)
- [12 Contact](#12-contact)
- [13 Questions or issues?](#13-questions-or-issues)
- [14 License](#14-license)

<br/>

## 4 Documentation

- [**API Reference**](docs/api-reference.md) - Public API documentation. Covers metadata management, navigation control and event subscriptions for JavaScript/TypeScript developers.

- [**Theming Guide**](docs/theming-guide.md) - Guide for theme developers. Includes CSS class reference, custom
  properties, and theme examples for light and dark modes.

- [**Startup Process**](docs/startup-process.md) - Plugin initialization sequence. Cold boot vs warm boot flows,
  metadata cache resolution, deferred cleanup, and content generation pipeline. Includes Mermaid diagrams.

- [**Metadata Pipeline**](docs/metadata-pipeline.md) - Cache rebuild sequence, provider pipeline stages, and completion signals. Includes Mermaid diagrams.

- [**Storage Architecture**](docs/storage-architecture.md) - Guide to storage containers (IndexedDB, Local Storage,
  Memory Cache, Settings). Data flow patterns and usage guidelines.

- [**Rendering Architecture**](docs/rendering-architecture.md) - React component hierarchy, virtual scrolling with
  TanStack Virtual, performance optimizations, and data flow.

- [**Scroll Orchestration**](docs/scroll-orchestration.md) - How the plugin ensures accurate scrolling when tree structures change (tag visibility, settings, etc.)

- [**Service Architecture**](docs/service-architecture.md) - Business logic layer: MetadataService, FileSystemOperations, ContentProviderRegistry. Dependency injection patterns and service data flow.

- [**Upstream Sync Guide**](docs/upstream-sync.md) - Repeatable merge, namespace, isolation, and side-by-side validation workflow for later Notebook Navigator releases.

<br/>

## 5 Keyboard shortcuts

| Key                                 | Action                                                                                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ↑/↓                                 | Navigate up/down in current pane                                                                                                                                                          |
| ←                                   | In navigation pane: collapse or go to parent<br>In list pane: switch to navigation pane                                                                                                   |
| →                                   | In navigation pane: expand or switch to list pane<br>In list pane: switch to editor                                                                                                       |
| Tab                                 | In navigation pane: switch to list pane<br>In list pane: switch to editor<br>In search field: switch to list pane                                                                         |
| Shift+Tab                           | In list pane: switch to navigation pane<br>In search field: switch to navigation pane                                                                                                     |
| Enter (macOS)<br>F2 (Windows/Linux) | Rename item inline in navigation pane or list pane                                                                                                                                        |
| Enter                               | In navigation pane: open folder note on Windows/Linux by default (when enabled)<br>In list pane: open selected file on all systems (when enabled)<br>In search field: switch to list pane |
| Escape                              | In search field: close search and focus list pane                                                                                                                                         |
| PageUp/PageDown                     | Scroll up/down in navigation pane and list pane                                                                                                                                           |
| Home/End                            | Jump to first/last item in current pane                                                                                                                                                   |
| Delete<br>Backspace                 | Delete selected item                                                                                                                                                                      |
| Cmd/Ctrl+A                          | Select all notes in current folder                                                                                                                                                        |
| Cmd/Ctrl+Click                      | Toggle notes selection                                                                                                                                                                    |
| Shift+Click                         | Select a range of notes                                                                                                                                                                   |
| Shift+Home/End                      | Select from current position to first/last item                                                                                                                                           |
| Shift+↑/↓                           | Extend selection up/down                                                                                                                                                                  |
| Cmd/Ctrl+↑/↓                        | Rearrange selected files up/down in manual sort mode                                                                                                                                      |

**Note:** All keyboard shortcuts can be customized. See [section 8 - Custom hotkeys](#8-custom-hotkeys) for details on adding VIM-style navigation (h,j,k,l), alternate keys, and modifier combinations.

<br/>

## 6 Synced and local settings

Many settings in Notebook Navigator display a sync toggle — a cloud icon that switches between "Enable sync" and "Disable sync". This controls where each setting is stored and whether it is shared across devices.

### 6.1 How sync works

Obsidian plugins store their configuration in `data.json`, located at `.obsidian/plugins/tps-notebook-navigator/data.json` inside your vault folder. When you use a sync service — such as [Obsidian Sync](https://obsidian.md/sync), iCloud, GitHub, Dropbox, or Google Drive — this file is synchronized across all your devices along with the rest of your vault. Any setting saved to `data.json` will propagate to every device that syncs the vault.

<img width="606" height="48" alt="Screenshot 2026-02-18 at 22 58 05" src="https://github.com/user-attachments/assets/01d92458-1967-4008-acae-f722eee0d0a2" />

When sync is **enabled** (default) for a setting, the value is saved to `data.json` and synchronized to all devices through your sync service.

<img width="608" height="49" alt="Screenshot 2026-02-18 at 22 58 14" src="https://github.com/user-attachments/assets/f6f4c839-f8b8-42b5-be43-1cb6c78abdb3" />

<br/>

When sync is **disabled** for a setting, the value is saved to Obsidian's local storage instead. Local storage is device-specific and is not included in vault sync. The setting will have its own independent value on each device. When you disable sync for a setting, the current value is copied to local storage on the current device, and the value is removed from `data.json` to prevent it from overriding local values on other devices.

If you do not use a sync service, the sync toggle has no practical effect since `data.json` is only stored locally.

<br/>

## 7 Search

Notebook Navigator has two search modes: filter search and Omnisearch. Switch between them using the up/down arrow keys or by clicking the search icon. Combine file names, properties, tags, dates, and filters in one query (e.g., `meeting .status=active #work @thisweek`).

### 7.1 Filter search

Filters files by display name, alias, tags, properties, dates, folders, extensions, and tasks within the current folder and subfolders. Default search mode.

**File names and aliases**

- `word` - Match notes with "word" in the display name or an alias
- `word1 word2` - Require every word to match across the display name and aliases
- `-word` - Exclude notes with "word" in the display name or an alias
- `".F"` - Match text literally; a term that opens with a double quote is never interpreted as a tag, property, date, or filter (e.g., `".F"` matches names containing `.F` instead of filtering on a property)
- `-".F"` - Exclude notes with the literal text in the display name or an alias

**Tags**

- `#tag` - Include notes with tag (also matches nested tags like `#tag/subtag`)
- `#` - Include only tagged notes
- `-#tag` - Exclude notes with tag
- `-#` - Include only untagged notes
- `#tag1 #tag2` - Match both tags (implicit AND)
- `#tag1 AND #tag2` - Match both tags (explicit AND)
- `#tag1 OR #tag2` - Match either tag
- `#a OR #b AND #c` - AND has higher precedence: matches `#a`, or both `#b` and `#c`
- Cmd/Ctrl+Click a tag to add with AND. Cmd/Ctrl+Shift+Click to add with OR

**Properties**

- `.key` - Include notes with a property key that starts with `key`
- `.key=value` - Include notes where the property value contains `value`
- `."Reading Status"` - Property key with whitespace (double-quoted)
- `."Reading Status"="In Progress"` - Keys and values with whitespace must be double-quoted
- `-.key` - Exclude notes with a property key that starts with `key`
- `-.key=value` - Exclude notes where the property value contains `value`
- Cmd/Ctrl+Click a property to add with AND. Cmd/Ctrl+Shift+Click to add with OR

**Filters**

- `has:task` - Include notes with unfinished tasks
- `-has:task` - Exclude notes with unfinished tasks
- `folder:meetings` - Include notes where a folder name contains `meetings`
- `folder:/work/meetings` - Include notes only in `work/meetings` (not subfolders)
- `folder:/` - Include notes only in the vault root
- `-folder:archive` - Exclude notes where a folder name contains `archive`
- `-folder:/archive` - Exclude notes only in `archive` (not subfolders)
- `ext:md` - Include notes with extension `md` (`ext:.md` is also supported)
- `-ext:pdf` - Exclude notes with extension `pdf`
- Combine with tags, names, and dates (e.g., `folder:/work/meetings ext:md @thisweek`)

**Dates**

- `@today` - Match notes from today using the default date field
- `@yesterday`, `@last7d`, `@last30d`, `@thisweek`, `@thismonth` - Relative date ranges
- `@2026-02-07` - Match a single day (also supports `@20260207`)
- `@2026` - Match a calendar year
- `@2026-02` or `@202602` - Match a calendar month
- `@2026-W05` or `@2026W05` - Match an ISO week
- `@2026-Q2` or `@2026Q2` - Match a calendar quarter
- `@13/02/2026` - Numeric formats with separators (`@07022026` follows your locale when ambiguous)
- `@2026-02-01..2026-02-07` - Match an inclusive day range (open ends supported)
- `@c:...` or `@m:...` - Target created or modified date
- `-@...` - Exclude a date match

The default date field follows the current sort order. When sorting by name, the date field is configured in Settings → Notes → Date → When sorting by name.

**AND/OR behavior**

`AND` and `OR` operators work in tag/property-only queries (queries that contain only `#tag`, `-#tag`, `#`, `-#`, `.key`, `-.key`, `.key=value`, or `-.key=value` filters). If the query also includes names, dates, task filters, folder filters, or extension filters, `AND` and `OR` are matched as file name words instead.

- Operator query: `#work OR .status=started`
- Mixed query: `#work OR ext:md` (`OR` is matched in file names)

### 7.2 Omnisearch

Full-text search across the vault, filtered to the current folder, subfolders, or selected tags. Requires the [Omnisearch](https://github.com/scambier/obsidian-omnisearch) plugin. If Omnisearch is not installed, search falls back to filter search.

Note previews show Omnisearch result excerpts instead of the default preview text.

**Known limitations**

- **Performance** - Can be slow when searching for fewer than 3 characters in large vaults
- **Path filters** - Folder scoping is sent to Omnisearch for all folder paths except names containing `"` or `,`. Folder names with non-ASCII characters require Omnisearch 1.30.0 or later. Results are always filtered to the current view after Omnisearch returns
- **Limited results** - Omnisearch returns at most 50 results. When searching in a folder, the limit covers the folder and its subfolders, so subfolder matches count toward the limit even when `Show notes from subfolders` is disabled
- **Preview text** - Note previews are replaced with Omnisearch result excerpts, which may not show the actual search match highlight if it appears elsewhere in the file

<br/>

## 8 Custom hotkeys

Edit `.obsidian/plugins/tps-notebook-navigator/data.json` to customize Notebook Navigator hotkeys. Open the file and locate the `keyboardShortcuts` section. Each entry maps an action to one or more key bindings:

```json
"pane:move-up": [ { "key": "ArrowUp", "modifiers": [] }, { "key": "K", "modifiers": [] } ]
```

Add multiple bindings per action to support alternate keys, like the `ArrowUp` and `K` example above. Combine modifiers in one entry by listing each value, for example `"modifiers": ["Mod", "Shift"]`. Keyboard sequences such as `gg` or `dd` are not supported. Reload Obsidian after editing the file.

### 8.1 Modifiers

| Modifier | Key                                       |
| -------- | ----------------------------------------- |
| `Mod`    | Cmd (macOS) / Ctrl (Win/Linux)            |
| `Alt`    | Alt / Option                              |
| `Shift`  | Shift                                     |
| `Ctrl`   | Control (prefer `Mod` for cross-platform) |

### 8.2 Available actions

| Action                            | Default key(s)                    |
| --------------------------------- | --------------------------------- |
| `pane:move-up`                    | ArrowUp                           |
| `pane:move-down`                  | ArrowDown                         |
| `pane:page-up`                    | PageUp                            |
| `pane:page-down`                  | PageDown                          |
| `pane:home`                       | Home                              |
| `pane:end`                        | End                               |
| `pane:rename`                     | Enter (macOS), F2 (Windows/Linux) |
| `pane:delete-selected`            | Delete, Backspace                 |
| `navigation:collapse-or-parent`   | ArrowLeft                         |
| `navigation:expand-or-focus-list` | ArrowRight                        |
| `navigation:focus-list`           | Tab                               |
| `list:focus-navigation`           | ArrowLeft, Shift+Tab              |
| `list:focus-editor`               | ArrowRight, Tab                   |
| `list:select-all`                 | Mod+A                             |
| `list:extend-selection-up`        | Shift+ArrowUp                     |
| `list:extend-selection-down`      | Shift+ArrowDown                   |
| `list:manual-sort-up`             | Mod+ArrowUp                       |
| `list:manual-sort-down`           | Mod+ArrowDown                     |
| `list:range-to-start`             | Shift+Home                        |
| `list:range-to-end`               | Shift+End                         |
| `search:focus-list`               | Tab, Enter                        |
| `search:focus-navigation`         | Shift+Tab                         |
| `search:close`                    | Escape                            |

<br/>

## 9 Commands

Set custom hotkeys for these commands in Obsidian's Hotkeys settings:

**View & navigation**

- `Notebook Navigator: Open` Opens Notebook Navigator in left sidebar. If already open, moves keyboard focus over to the list pane. **Suggestion:** Bind to a shortcut key like `Cmd/Ctrl+Shift+E` to move keyboard focus to the list pane - **this is essential for full keyboard navigation**
- `Notebook Navigator: Toggle left sidebar` Toggles the left sidebar. When opening, sets the left sidebar view to Notebook Navigator (unlike Obsidian's built-in "Toggle left sidebar" command which restores the previous left sidebar view)
- `Notebook Navigator: Open homepage` Opens the Notebook Navigator view and loads the homepage target configured in settings
- `Notebook Navigator: Select vault profile` Opens modal to switch between vault profiles
- `Notebook Navigator: Select vault profile 1-3` Activates a vault profile by its position. Opens the profile selection modal when no profile exists at that position
- `Notebook Navigator: Reveal file` Reveals current file in navigator. Expands parent folders and scrolls to file. This command is useful if you have the setting `Auto-reveal active note` switched off and want to reveal notes manually. **Suggestion:** Bind to a shortcut key like `Cmd/Ctrl+Shift+R` to quickly change the selected folder or tag to the current file
- `Notebook Navigator: Open all files` Opens all notes in the currently selected folder or tag. When opening 15 or more files, shows a confirmation dialog
- `Notebook Navigator: Navigate to folder` Search dialog to jump to any folder
- `Notebook Navigator: Navigate to tag` Search dialog to jump to any tag
- `Notebook Navigator: Navigate to property` Search dialog to jump to any property key or value
- `Notebook Navigator: Navigate back` Moves to the previous folder, tag, or property selection in navigator history
- `Notebook Navigator: Navigate forward` Moves to the next folder, tag, or property selection in navigator history
- `Notebook Navigator: Add to shortcuts` Adds or removes the current file, folder, tag, or property from shortcuts
- `Notebook Navigator: Open shortcut 1-9` Opens shortcut by its position in the shortcuts list
- `Notebook Navigator: Search` Opens quick search field or focuses it if already open. Search persists between sessions. **Suggestion:** Bind to a shortcut key like `Cmd/Ctrl+Shift+S` for quick file filtering
- `Notebook Navigator: Search whole vault` Selects the vault root folder and opens search with subfolders included (requires `Show root folder` enabled)

**Selection**

- `Notebook Navigator: Select next file` Moves selection to the next file in the current folder or tag view. Respects custom sort order. **Suggestion:** Bind to a shortcut key like `Option+Cmd+Right` to quickly go to the next file in list
- `Notebook Navigator: Select previous file` Moves selection to the previous file in the current folder or tag view. Respects custom sort order. **Suggestion:** Bind to a shortcut key like `Option+Cmd+Left` to quickly go to the previous file in list

**Layout & display**

- `Notebook Navigator: Toggle dual pane layout` Toggle single/dual-pane layout (desktop and tablet). **Suggestion:** Bind to a shortcut key like `Cmd/Ctrl+Shift+A` to quickly switch between single-pane and dual-pane layout
- `Notebook Navigator: Toggle dual pane orientation` Toggle dual-pane orientation between horizontal and vertical
- `Notebook Navigator: Toggle descendants` Toggle subfolders / descendants notes display for folders and tags. **Suggestion:** Bind to a shortcut key like `Cmd/Ctrl+Shift+D` to quickly toggle display of notes from subfolders / descendants
- `Notebook Navigator: Toggle hidden folders, tags, and notes` Show or hide hidden folders, tags, and notes
- `Notebook Navigator: Toggle tag sort order` Toggle between alphabetical and frequency-based tag sorting
- `Notebook Navigator: Toggle tags by selection` Toggle limiting tags to those found in notes within the selected folder or property
- `Notebook Navigator: Toggle properties by selection` Toggle limiting properties to those found in notes within the selected folder or tag
- `Notebook Navigator: Toggle compact mode` Toggle list mode between standard and compact
- `Notebook Navigator: Toggle pinned section` Show or hide pinned notes in the list pane
- `Notebook Navigator: Collapse / expand all navigation items` Collapse or expand all navigation items based on the current state. When `Keep selected item expanded` is enabled (default on), all folders except the current one will be collapsed. This is handy to keep the navigation tree tidy when searching for documents
- `Notebook Navigator: Collapse / expand selected item` Collapse or expand the selected navigation item

**Calendar**

- `Notebook Navigator: Toggle calendar` Toggles calendar on or off. **Suggestion:** Bind to a shortcut key like `Cmd/Ctrl+Shift+C` to quickly show the calendar
- `Notebook Navigator: Open daily note` Opens today's daily note based on calendar settings. Creates the note if it doesn't exist
- `Notebook Navigator: Open weekly note` Opens the current weekly note. Creates the note if it doesn't exist
- `Notebook Navigator: Open monthly note` Opens the current monthly note. Creates the note if it doesn't exist
- `Notebook Navigator: Open quarterly note` Opens the current quarterly note. Creates the note if it doesn't exist
- `Notebook Navigator: Open yearly note` Opens the current yearly note. Creates the note if it doesn't exist

**File operations**

**Important:** Obsidian has no context of "current folder or tag", so when creating notes in Obsidian by default they are created in the root folder, same folder as current file, or a specific folder. When working with Notebook Navigator you always want to create new notes in the currently selected folder or tag, so the first thing you should do is bind `Cmd/Ctrl+N` to `Notebook Navigator: Create new note` so new notes are always created in the currently selected folder or tag. The same also applies to moving and deleting files. This is why you should use these commands instead of the built-in Obsidian commands when using Notebook Navigator.

- `Notebook Navigator: Create new note` Create note in currently selected folder. **Suggestion:** Bind `Cmd/Ctrl+N` to this command (unbind from Obsidian's default "Create new note" first)
- `Notebook Navigator: Create new note from template` Create note from template in currently selected folder (requires Templater)
- `Notebook Navigator: Move files` Move selected files to another folder. Selects next file in current folder
- `Notebook Navigator: Merge notes` Create one note from selected Markdown notes in the current list order
- `Notebook Navigator: Convert to folder note` Create a folder matching the file name and move the file inside as the folder note
- `Notebook Navigator: Set as folder note` Rename the active file to its folder note name
- `Notebook Navigator: Detach folder note` Detach the folder note in the selected folder and rename it
- `Notebook Navigator: Pin all folder notes` Pin all folder notes in all folders. Command is only visible when folder notes are enabled
- `Notebook Navigator: Delete files` Delete selected files. Selects next file in current folder

**Tag operations**

- `Notebook Navigator: Add tag to selected files` Dialog to add tag to selected files. Supports creating new tags
- `Notebook Navigator: Set property on selected files` Dialog to set property on selected files
- `Notebook Navigator: Remove tag from selected files` Dialog to remove specific tag. Removes immediately if only one tag
- `Notebook Navigator: Remove all tags from selected files` Clear all tags from selected files with confirmation

**Maintenance**

- `Notebook Navigator: Rebuild cache` Rebuilds the local Notebook Navigator cache. Use this if you experience missing tags, incorrect previews or missing feature images
- `Notebook Navigator: Restore default settings` Replaces the settings file with verified defaults after saving a timestamped backup. This command is only available when Notebook Navigator cannot read its settings and stops during startup

### 9.1 Command IDs

| Command ID                                              | Command name                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| `tps-notebook-navigator:open`                           | TPS Notebook Navigator: Open                                   |
| `tps-notebook-navigator:toggle-left-sidebar`            | TPS Notebook Navigator: Toggle left sidebar                    |
| `tps-notebook-navigator:open-homepage`                  | TPS Notebook Navigator: Open homepage                          |
| `tps-notebook-navigator:select-profile`                 | TPS Notebook Navigator: Select vault profile                   |
| `tps-notebook-navigator:select-profile-1`               | TPS Notebook Navigator: Select vault profile 1                 |
| `tps-notebook-navigator:select-profile-2`               | TPS Notebook Navigator: Select vault profile 2                 |
| `tps-notebook-navigator:select-profile-3`               | TPS Notebook Navigator: Select vault profile 3                 |
| `tps-notebook-navigator:reveal-file`                    | TPS Notebook Navigator: Reveal file                            |
| `tps-notebook-navigator:open-all-files`                 | TPS Notebook Navigator: Open all files                         |
| `tps-notebook-navigator:navigate-to-folder`             | TPS Notebook Navigator: Navigate to folder                     |
| `tps-notebook-navigator:navigate-to-tag`                | TPS Notebook Navigator: Navigate to tag                        |
| `tps-notebook-navigator:navigate-to-property`           | TPS Notebook Navigator: Navigate to property                   |
| `tps-notebook-navigator:navigate-back`                  | TPS Notebook Navigator: Navigate back                          |
| `tps-notebook-navigator:navigate-forward`               | TPS Notebook Navigator: Navigate forward                       |
| `tps-notebook-navigator:add-shortcut`                   | TPS Notebook Navigator: Add to shortcuts                       |
| `tps-notebook-navigator:open-shortcut-1`                | TPS Notebook Navigator: Open shortcut 1                        |
| `tps-notebook-navigator:open-shortcut-2`                | TPS Notebook Navigator: Open shortcut 2                        |
| `tps-notebook-navigator:open-shortcut-3`                | TPS Notebook Navigator: Open shortcut 3                        |
| `tps-notebook-navigator:open-shortcut-4`                | TPS Notebook Navigator: Open shortcut 4                        |
| `tps-notebook-navigator:open-shortcut-5`                | TPS Notebook Navigator: Open shortcut 5                        |
| `tps-notebook-navigator:open-shortcut-6`                | TPS Notebook Navigator: Open shortcut 6                        |
| `tps-notebook-navigator:open-shortcut-7`                | TPS Notebook Navigator: Open shortcut 7                        |
| `tps-notebook-navigator:open-shortcut-8`                | TPS Notebook Navigator: Open shortcut 8                        |
| `tps-notebook-navigator:open-shortcut-9`                | TPS Notebook Navigator: Open shortcut 9                        |
| `tps-notebook-navigator:search`                         | TPS Notebook Navigator: Search                                 |
| `tps-notebook-navigator:search-vault`                   | TPS Notebook Navigator: Search whole vault                     |
| `tps-notebook-navigator:toggle-dual-pane`               | TPS Notebook Navigator: Toggle dual pane layout                |
| `tps-notebook-navigator:toggle-dual-pane-orientation`   | TPS Notebook Navigator: Toggle dual pane orientation           |
| `tps-notebook-navigator:toggle-calendar`                | TPS Notebook Navigator: Toggle calendar                        |
| `tps-notebook-navigator:open-daily-note`                | TPS Notebook Navigator: Open daily note                        |
| `tps-notebook-navigator:open-weekly-note`               | TPS Notebook Navigator: Open weekly note                       |
| `tps-notebook-navigator:open-monthly-note`              | TPS Notebook Navigator: Open monthly note                      |
| `tps-notebook-navigator:open-quarterly-note`            | TPS Notebook Navigator: Open quarterly note                    |
| `tps-notebook-navigator:open-yearly-note`               | TPS Notebook Navigator: Open yearly note                       |
| `tps-notebook-navigator:toggle-descendants`             | TPS Notebook Navigator: Toggle descendants                     |
| `tps-notebook-navigator:toggle-hidden`                  | TPS Notebook Navigator: Toggle hidden folders, tags, and notes |
| `tps-notebook-navigator:toggle-tag-sort`                | TPS Notebook Navigator: Toggle tag sort order                  |
| `tps-notebook-navigator:toggle-tags-by-selection`       | TPS Notebook Navigator: Toggle tags by selection               |
| `tps-notebook-navigator:toggle-properties-by-selection` | TPS Notebook Navigator: Toggle properties by selection         |
| `tps-notebook-navigator:toggle-compact-mode`            | TPS Notebook Navigator: Toggle compact mode                    |
| `tps-notebook-navigator:toggle-pinned-section`          | TPS Notebook Navigator: Toggle pinned section                  |
| `tps-notebook-navigator:collapse-expand-list-groups`    | TPS Notebook Navigator: Collapse / expand all list groups      |
| `tps-notebook-navigator:collapse-expand`                | TPS Notebook Navigator: Collapse / expand all navigation items |
| `tps-notebook-navigator:collapse-expand-selected-item`  | TPS Notebook Navigator: Collapse / expand selected item        |
| `tps-notebook-navigator:new-note`                       | TPS Notebook Navigator: Create new note                        |
| `tps-notebook-navigator:new-note-from-template`         | TPS Notebook Navigator: Create new note from template          |
| `tps-notebook-navigator:move-files`                     | TPS Notebook Navigator: Move files                             |
| `tps-notebook-navigator:merge-notes`                    | TPS Notebook Navigator: Merge notes                            |
| `tps-notebook-navigator:select-next-file`               | TPS Notebook Navigator: Select next file                       |
| `tps-notebook-navigator:select-previous-file`           | TPS Notebook Navigator: Select previous file                   |
| `tps-notebook-navigator:convert-to-folder-note`         | TPS Notebook Navigator: Convert to folder note                 |
| `tps-notebook-navigator:set-as-folder-note`             | TPS Notebook Navigator: Set as folder note                     |
| `tps-notebook-navigator:detach-folder-note`             | TPS Notebook Navigator: Detach folder note                     |
| `tps-notebook-navigator:pin-all-folder-notes`           | TPS Notebook Navigator: Pin all folder notes                   |
| `tps-notebook-navigator:delete-files`                   | TPS Notebook Navigator: Delete files                           |
| `tps-notebook-navigator:add-tag`                        | TPS Notebook Navigator: Add tag to selected files              |
| `tps-notebook-navigator:set-property`                   | TPS Notebook Navigator: Set property on selected files         |
| `tps-notebook-navigator:remove-tag`                     | TPS Notebook Navigator: Remove tag from selected files         |
| `tps-notebook-navigator:remove-all-tags`                | TPS Notebook Navigator: Remove all tags from selected files    |
| `tps-notebook-navigator:rebuild-cache`                  | TPS Notebook Navigator: Rebuild cache                          |
| `tps-notebook-navigator:restore-default-settings`       | TPS Notebook Navigator: Restore default settings               |

<br/>

## 10 Features

### 10.1 Interface

- **Dual-pane layout** - Navigation pane (folders/tags/properties/types) and list pane (files or virtual entity rows)
- **Single-pane mode** - Navigation and list views with animated transitions
- **Resizable panes** - Horizontal or vertical split orientation
- **Independent UI zoom** - Scale Notebook Navigator without changing Obsidian zoom
- **Startup view** - Navigation-first or list-first
- **Multi-language support** - 21 languages with RTL layout support
- **Interface icon set** - Customizable UI icons across the plugin

### 10.2 Navigation

- **Vault profiles** - Multiple filtered views with per-profile hidden folders/tags/notes, file visibility, banner, and shortcuts
- **Shortcuts** - Notes, folders, tags, properties, and saved searches with pinning and reordering
- **Recent notes/files** - Recent items section stored per vault profile, optionally pinned with shortcuts
- **Calendar** - Daily notes calendar with day selection, feature image previews, and vertical split support
- **Folder tree** - Expand/collapse navigation with manual root folder ordering
- **Tag tree** - Hierarchical tags with configurable root tag ordering
- **Property browser** - Browse file properties organized by key and value with file counts, custom colors, icons, and drag and drop
- **Types browser** - Browse structural notes/checkboxes/bullets/headings and dynamic relational Kind entities, opening notes or exact source lines
- **Auto-reveal active file** - Folder expansion and scroll-to-selection
- **Keyboard and commands** - Configurable hotkeys, selection history back/forward commands, next/previous file commands, open shortcut 1–9 commands

### 10.3 Organization

- **Pin notes** - Keep important notes at the top of folders and tags
- **Folder notes** - Set/detach folder notes, pin folder notes, open in new tab option
- **Tag operations** - Add/remove/clear tags, rename/delete tags, create note in tag, drag-and-drop tag hierarchy
- **Custom sort and grouping** - Override sort/group settings per folder or tag
- **Per-folder/tag appearances** - Title rows, preview rows, compact mode, descendants toggle
- **Hidden content** - Hidden folders/tags/notes/files with patterns, frontmatter properties, and tag-based filtering per vault profile
- **Exclude folders from descendants** - Omit folders when collecting notes from subfolders, per vault profile; excluded folders stay visible and show their notes when selected
- **Color and icon system** - Folder/tag/property/file colors, icon packs, emoji/Lucide icons, frontmatter read/write, icon mapping by file name and file type category
- **Name warnings** - Warn about forbidden filesystem characters and characters that break Obsidian links when naming files and folders

### 10.4 File display

- **Note previews** - 1–5 preview lines with optional HTML stripping
- **Thumbnails** - Featured images plus auto-generated thumbnails for PDF, SVG, and drawing files stored in the metadata cache
- **External images** - Optional downloads for external images and YouTube thumbnails
- **Date grouping** - Group notes by Today, Yesterday, Previous 7 days, Previous 30 days, months, and years when sorted by date
- **Property grouping** - Group notes by a frontmatter property value, matching group by in Obsidian Bases: notes sharing the same value collect under one header, notes without the property go into a trailing None group, and groups sort by value with natural ordering
- **Frontmatter support** - Read note names and timestamps from frontmatter fields
- **Note metadata** - Show modification date and tags in the file list
- **Custom properties** - Display frontmatter properties or word count in file list with per-folder/tag overrides and custom colors
- **Parent folder display** - Optional parent folder name and icon in file list
- **Compact mode** - Compact display when preview, date, and images are disabled
- **Clickable tags** - Tags in file list navigate directly to that tag

### 10.5 Productivity

- **Search** - Filter by file name, aliases, tags, properties, dates, folders, extensions, and tasks with AND/OR/exclusions
- **Omnisearch integration** - Full-text search via [Omnisearch](https://github.com/scambier/obsidian-omnisearch)
- **Drag and drop** - File moves, tagging, shortcut assignment, tag tree reparenting, spring-loaded folders
- **Context menus** - Create notes/folders/canvases/bases/drawings and run file/tag actions
- **Drawings** - Create Excalidraw and Tldraw drawings from navigation and list pane menus
- **Templates** - New note from template commands with the Templater plugin
- **File operations** - Create, rename, duplicate, move, trash files and folders
- **Filtering** - Folder/tag/note/file exclusions with patterns and frontmatter properties

<br/>

## 11 Network and Diagnostics Disclosure

Notebook Navigator runs locally, but some features make HTTP requests from Obsidian. Startup debug logging can also write a local diagnostic file in your vault.

### 11.1 Release update checks (Optional)

- **Setting:** "Check for new version on start"
- **Request:** `https://api.github.com/repos/ZachTish/tps-notebook-navigator/releases/latest`
- **Frequency:** At most once per 24 hours, on startup
- **Data:** Sends standard HTTP metadata; does not include vault content

### 11.2 Icon pack downloads (Optional)

- **Setting:** Enable an icon pack in the Icon Packs tab
- **Requests:** `https://raw.githubusercontent.com/johansan/notebook-navigator/main/icon-assets/...` (manifest, font, metadata)
- **Storage:** Stored locally in IndexedDB

### 11.3 External images, videos, and YouTube thumbnails

- **Feature images (Optional):** Controlled by the "Download external images" setting. Downloads remote images and YouTube thumbnails for feature images and stores them locally in IndexedDB.
- **Welcome modal (First launch):** Loads a YouTube thumbnail from `https://img.youtube.com/vi/<id>/...`.
- **What's new modal (On update / when opened):** Loads release banner images from `https://raw.githubusercontent.com/johansan/notebook-navigator/main/images/version-banners/<id>.jpg` for release notes that include a banner.
- **What's new modal (On update / when opened):** Loads release videos from `https://raw.githubusercontent.com/johansan/notebook-navigator/main/images/version-banners/<id>.mp4` for release notes that include a video.
- **What's new modal (When opening a release video):** Opens release videos from `https://cdn.jsdelivr.net/gh/johansan/notebook-navigator@main/images/version-banners/<id>.mp4` so browsers can play the video directly.
- **What's new modal (On update / when opened):** Loads YouTube thumbnails from `https://img.youtube.com/vi/<id>/...` for release notes that include a YouTube link.

### 11.4 Startup debug files (Optional)

- **Setting:** "Startup debug logging"
- **Storage:** Writes a timestamped `tps-nn-debug-...md` file in the vault root, then stops after startup settles. The file may sync if the vault root is synced.
- **Data:** Includes startup timing, plugin version, minimum supported Obsidian version, platform, cache counts, queue counts, IndexedDB status, and diagnostic errors. It does not include note contents, tag names, frontmatter values, or a list of vault files.
- **Paths and identifiers:** Startup initialization, PDF diagnostics, and error cases can include the Obsidian app/vault identifier, vault-relative PDF paths, or error stack details. Review and redact the file before sharing it publicly.
- **Upload:** Notebook Navigator does not upload debug files. They are shared only if you upload, attach, or sync them outside the plugin.

### 11.5 Privacy and data handling

- Notebook Navigator does not send note content, file names, tags, or debug files to a Notebook Navigator server.
- Requests to GitHub, YouTube, and any external image host are made directly from your device and include standard HTTP metadata (IP address, user-agent, and similar).
- Downloaded icon packs and images are stored locally (IndexedDB). Recent notes/files and UI state are stored locally (Obsidian local storage).

<br/>

## 12 Contact

The original Notebook Navigator is built and maintained by [Johan Sanneblad](https://github.com/johansan/notebook-navigator). TPS Notebook Navigator is an independent experimental fork maintained in [ZachTish/tps-notebook-navigator](https://github.com/ZachTish/tps-notebook-navigator). Upstream attribution, copyright notices, and GPL licensing are preserved.

<br/>

## 13 Questions or issues?

Read the inherited [FAQ](FAQ.md) for upstream feature guidance. For TPS fork behavior, release artifacts, or integration problems, use the [TPS fork repository](https://github.com/ZachTish/tps-notebook-navigator). Report problems with unmodified upstream behavior to the [original Notebook Navigator project](https://github.com/johansan/notebook-navigator/issues).

<br/>

## 14 License

This fork is licensed under the GNU General Public License v3.0; see [LICENSE](LICENSE). It is based on GPL-licensed Notebook Navigator and retains the upstream copyright notices.
