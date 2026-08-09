/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Release Notes System
 *
 * This module manages the "What's new" feature that shows users what has changed
 * between plugin versions. The system works as follows:
 *
 * 1. On plugin load, it compares the current version with the last shown version
 * 2. If version increased, it shows all release notes between versions
 * 3. If downgraded or same version, it shows the latest 5 releases
 * 4. Individual releases can be marked with showOnUpdate: false to skip auto-display
 * 5. Users can always manually access release notes via plugin settings
 *
 * The lastShownVersion is stored in plugin settings to track what the user has seen.
 */

import { compareVersions } from './utils/versionUtils';
export { compareVersions } from './utils/versionUtils';

/**
 * Formatting in release notes
 *
 * Supported inline formats in both info and list items:
 * - Bold text: **text**
 * - Critical emphasis (red + bold): ==text==
 * - Inline code: `code`
 * - Markdown link: [label](https://example.com)
 * - Auto-link: https://example.com
 *
 * Supported block formats in info:
 * - Line break: single \n or <br>
 * - Paragraph break: double \n\n or two consecutive <br> markers
 *
 * Not supported:
 * - Italics, headings, fenced code blocks, HTML except <br> line break markers
 *
 * Writing rules:
 * - Use factual, concise statements
 * - Avoid benefit language and subjective adjectives
 * - Keep to the categories: new, improved, changed, fixed
 * - Do not start list items with a bold area prefix such as `**Calendar.**` (used in 3.2.3 and earlier)
 */

/**
 * Positions the play button over a YouTube thumbnail.
 */
export interface YoutubePlayButtonOptions {
    /** Horizontal center as a percentage of the thumbnail width */
    x: number;
    /** Vertical center as a percentage of the thumbnail height */
    y: number;
    /** Multiplier applied to the default play button size; defaults to 1 */
    scale?: number;
}

/**
 * Represents a single release note entry
 */
export interface ReleaseNote {
    version: string;
    date: string;
    /** If false, skip automatic modal display for this version during startup */
    showOnUpdate?: boolean;
    /** Optional banner image source. true uses version as banner id, string uses explicit URL or banner id */
    bannerUrl?: boolean | string;
    /** When true, the banner opens the full image in a new tab */
    bannerClickable?: boolean;
    /** Optional autoplay video source. true uses version as video id, string uses explicit URL or video id */
    videoUrl?: boolean | string;
    /** When true, the video can be opened in a new tab */
    videoClickable?: boolean;
    /** Optional YouTube video URL shown above the release notes for this version */
    youtubeUrl?: string;
    /** Optional play button placement; thumbnails otherwise use a centered button at its default size */
    youtubePlayButton?: YoutubePlayButtonOptions;
    info?: string; // General information about the release, shown at top without bullets
    new?: string[];
    improved?: string[];
    changed?: string[];
    fixed?: string[];
}

/**
 * All release notes for the plugin, ordered from newest to oldest.
 *
 * When adding a new release:
 * 1. Add it at the beginning of the array (newest first)
 * 2. Categorize features into: new, improved, changed, or fixed arrays
 */
const RELEASE_NOTES: ReleaseNote[] = [
    {
        version: '5.14.1',
        date: '2026-08-09',
        fixed: [
            'The desktop horizontal list pane now assigns its changing header, scroll viewport, optional calendar, and toolbar to explicit grid rows, preventing the scroll viewport from retaining an older height and leaving a blank strip at the bottom.'
        ]
    },
    {
        version: '5.14.0',
        date: '2026-08-09',
        new: [
            'Constructible Filter Searches expose a New matching item action when one supported Type and every positive requirement can be applied deterministically.'
        ],
        changed: [
            'A nonempty search now overrides navigation-selection creation. Ambiguous searches keep the action disabled instead of falling through to unrelated note creation.',
            'Matching checkbox creation applies required task-local tags, exact inline fields, and canonical status through the GCM task API.'
        ]
    },
    {
        version: '5.13.1',
        date: '2026-08-09',
        fixed: [
            'Tag filters on exact task, bullet, and heading rows now evaluate the line-local GCM tag list instead of accepting rows merely because their owning note has the tag.',
            'Exact-line tag filters preserve folder, date, extension, task-state, and navigation scope while supporting nested tags, exclusions, untagged queries, and tag/property expressions.'
        ]
    },
    {
        version: '5.13.0',
        date: '2026-08-09',
        new: ['Bases and Canvas Type views now expose New base and New canvas actions.'],
        changed: [
            'File-backed Type creation reuses the native folder creation operations, creates in the vault root, opens the result, and starts the normal rename flow.'
        ]
    },
    {
        version: '5.12.1',
        date: '2026-08-09',
        fixed: [
            'The vault root now includes the canonical Checkboxes, Bullets, Headings, Code blocks, Callouts, Blockquotes, Tables, and Web links collections alongside visible files.',
            'Canonical root Checkboxes replace the optional attached task feed without duplicating the same tasks; the attached feed remains the fallback when Checkboxes are unavailable.'
        ]
    },
    {
        version: '5.12.0',
        date: '2026-08-09',
        changed: [
            'Selecting the vault root now shows resources from the complete visible vault instead of only direct children.',
            'Compact appearance now condenses attached task and provider rows together with ordinary file rows.'
        ],
        fixed: ['The root descendants control now reflects that the all-resources root scope always includes subfolders.']
    },
    {
        version: '5.11.0',
        date: '2026-08-09',
        changed: ['Hydrated desktop task rows can be dragged into an editor as their complete Markdown task line.'],
        fixed: ['Task-row checkbox, title, and More controls retain transparent native row chrome.']
    },
    {
        version: '5.10.3',
        date: '2026-08-09',
        fixed: ['Task rows attached to ordinary note lists now group by task-local properties instead of the source note group.']
    },
    {
        version: '5.10.2',
        date: '2026-08-08',
        fixed: ['Existing vaults now migrate the former line-first default to task-local property grouping once.']
    },
    {
        version: '5.10.1',
        date: '2026-08-08',
        fixed: ['Untagged tasks no longer retain an owning-note tag and appear in that tag group.']
    },
    {
        version: '5.10.0',
        date: '2026-08-08',
        new: ['Property grouping can now place the No value group at the top or bottom.'],
        changed: ['The No value placement is saved independently for each folder, tag, property, or Type appearance.']
    },
    {
        version: '5.9.0',
        date: '2026-08-08',
        changed: [
            'Checkboxes, Bullets, and Headings now use only properties written on the line by default.',
            'The sort and group menu now always shows the property inheritance choice for line-backed Types.'
        ],
        fixed: ['Tasks without their own tag no longer inherit the owning note tag into a group unless inheritance is explicitly enabled.']
    },
    {
        version: '5.4.0',
        date: '2026-08-03',
        showOnUpdate: true,
        info: 'Source-backed Types can now create items, group task dates by calendar day, and browse Web links.',
        new: [
            "The Types create button can append checkboxes, bullets, headings, code blocks, callouts, blockquotes, tables, and web links to today's daily note, the active note, or a configured note.",
            'Web links is a searchable built-in Type backed by a bounded local Markdown index, showing only URL origins with no network requests and guarded source-line activation.',
            'Property grouping adds a calendar-day mode so scheduled timestamps on the same day share one group while exact datetime grouping remains available.',
            'GCM task, bullet, and heading views—and their active mixed-search sections—can group by owning-note frontmatter or strictly by exact line fields; missing line values never inherit from the note.'
        ],
        improved: [
            'Exact GCM task, bullet, and heading fields continue to drive property sorting before owning-note frontmatter, including scheduled and canonical task status values.',
            "Creation is atomic, creates today's Daily Note from its configured folder/format/template when needed, opens the inserted source position, and delegates checkbox creation to TPS Global Context Menu so configured task mappings remain authoritative."
        ],
        changed: [
            'Public API 3.3.0 adds the stable Web links Type id plus note/line exact-value and calendar-day grouping encodings without changing existing Type ids.',
            "Today's daily note is the default Type creation target; generic line-property grouping uses TPS Global Context Menu 1.18.0, and existing settings require no migration."
        ]
    },
    {
        version: '5.3.1',
        date: '2026-08-02',
        showOnUpdate: true,
        info: 'The desktop list now uses the full available height in tall and resized Navigator panes.',
        fixed: [
            'Horizontal two-pane layouts explicitly keep the list pane, its panel, and the scroll viewport connected from top to bottom.',
            'Grouped property and Type lists no longer leave an unusable blank region beneath the scrollable results after the leaf grows.'
        ]
    },
    {
        version: '5.3.0',
        date: '2026-08-02',
        showOnUpdate: true,
        info: 'Built-in Types can now be sorted, grouped, and combined in one Filter Search.',
        new: [
            'Sort and Group controls are available for Checkboxes, Bullets, Headings, Code blocks, Callouts, Blockquotes, and Tables.',
            'Filter Search supports stable `type:<fixed-id>` and `-type:<fixed-id>` facets; multiple positive Type facets form a union.',
            'Shift-click can combine fixed Types with tags and properties while keeping each result tied to its owning Type.'
        ],
        improved: [
            'A nonempty Filter Search started from any built-in Type searches the complete built-in Type catalog and labels each source-backed result section.',
            'Source-backed rows can sort by row title or owning-note fields and group by compatible owning-note dates or properties.'
        ],
        changed: [
            "Public API 3.2.0 adds bounded presentation updates for fixed source-backed Types and exposes each mixed structural row's fixed Type identity.",
            'Omnisearch remains a ranked file-only search; mixed file and structural results use Filter Search.'
        ],
        fixed: [
            'Source-backed Types no longer inherit unsupported manual-rank sorting, and structural rows no longer mix into Omnisearch snapshots.'
        ]
    },
    {
        version: '5.2.0',
        date: '2026-08-02',
        showOnUpdate: true,
        info: 'Types can now follow an automatic order or a user-defined sequence in the navigation pane.',
        new: [
            'Reorder navigation adds Default, A to Z, Z to A, Most items first, Fewest items first, and Manual order modes for Types.',
            'Each Type row has accessible up and down controls, retains desktop drag ordering, and uses a handle-only drag target on mobile.'
        ],
        improved: [
            'Automatic quantity ordering follows the same visibility-filtered counts shown by the active profile, while collections without published counts remain after counted Types.',
            'Narrow desktop panes prioritize readable Type names; mobile keeps a stacked selector and touch-sized ordering controls.'
        ],
        changed: [
            'Moving or dragging a Type switches to Manual order. The selected mode and manual ids persist in TPS settings without changing the public API catalog order.'
        ],
        fixed: [
            'Temporarily unavailable provider Types retain their manual positions, new Types append predictably, and upstream settings imports cannot overwrite the TPS-only order.'
        ]
    },
    {
        version: '5.1.0',
        date: '2026-08-02',
        showOnUpdate: true,
        info: 'Types now includes additional Markdown structures without requiring TPS Global Context Menu.',
        new: [
            'Adds Code blocks, Callouts, Blockquotes, and Tables as flat built-in Type collections.',
            'Public API `3.1.0` exposes stable ids for all four new collections.'
        ],
        improved: [
            'Markdown structure rows use native file-row presentation, identify their owning note and source line, and open the current cached source location.',
            'The new collections are built from Obsidian metadata-cache sections, update per changed note, and remain available when GCM is disabled.'
        ],
        changed: [
            'Structure rows are selectable, searchable, and keyboard navigable but intentionally remain outside file multi-select, rename, pinning, and drag until those mutations have a safe source-range contract.'
        ],
        fixed: [
            'Separate availability guards keep a GCM failure from hiding Navigator-owned Code blocks, Callouts, Blockquotes, or Tables.'
        ]
    },
    {
        version: '5.0.0',
        date: '2026-08-01',
        showOnUpdate: true,
        info: 'Types is now a clean, flat catalog of real file formats and exact-line structures instead of frontmatter Kind values.',
        new: [
            'Adds Bases, Canvas, Drawings, PDFs, Images, Audio, and Video alongside Notes, Checkboxes, Bullets, and Headings.',
            'File-backed Type collections use the ordinary Navigator file pipeline, including native rows, search, sort, grouping, selection, menus, drag, and opening behavior.'
        ],
        improved: [
            'Exact-line Checkboxes, Bullets, and Headings now use the native file-row visual language with restrained type-specific controls and mobile-safe touch targets.',
            'The fixed file catalog stays available without TPS Global Context Menu; only exact-line collections depend on its Entity Index.',
            'Sort, grouping, and appearance controls now work and persist per file-backed Type, including immediate refresh after relevant property changes.'
        ],
        changed: [
            'Frontmatter Kind collections no longer appear, restore, validate, or navigate beneath Types. Deprecated helpers can construct or parse legacy ids only so callers can migrate stale state safely.',
            'Public API `3.0.0` publishes the fixed catalog and broadens Type-provider visibility inputs to all visible vault-file paths.'
        ],
        fixed: [
            'File-backed Type pinning now uses one consistent context, and selection follows files that remain visible after a move instead of jumping to an adjacent row.'
        ]
    },
    {
        version: '4.11.0',
        date: '2026-08-01',
        showOnUpdate: true,
        info: 'TPS entity rows are now selectable, keyboard navigable, and available through a bounded public list-control API.',
        new: [
            'Public API `2.12.0` adds transient row selection, immutable row-selection events, and exact rendered-row focus without treating entity rows as files.',
            'Public API `2.13.0` adds pull-based list snapshots plus guarded search, sort, grouping, and display controls for the first mounted TPS Navigator view.'
        ],
        improved: [
            'Types continues to expose Notes, Checkboxes, Bullets, Headings, and dynamic Kinds; notes open their file and structural entities open their exact current source line.',
            'Search snapshots report the exact query and provider that produced visible rows, and failed presentation saves restore live settings without clobbering newer writes.',
            'Lifecycle payloads use an opaque per-host identity, so integrations handle same-millisecond reloads and wall-clock changes without retaining a dead registration.'
        ]
    },
    {
        version: '4.10.0',
        date: '2026-08-01',
        showOnUpdate: true,
        info: 'Provider rows now stop obsolete work instead of scanning or caching after the visible list changes.',
        new: [
            'Public API `2.11.0` gives every ordinary row-provider query its own cancellation signal while preserving existing providers and signal-free subscriptions.'
        ],
        improved: [
            'Scope, Type, search-path, revision, options, unregister, timeout, view teardown, and plugin unload transitions now cancel the exact active provider invocations.',
            'GCM task scans commit their bounded pass atomically, so cancelled work cannot populate caches, clear dirty paths, or schedule another progressive refresh.'
        ]
    },
    {
        version: '4.9.1',
        date: '2026-08-01',
        showOnUpdate: true,
        info: 'Type collection actions now reject invalid asynchronous construction without exposing a partial menu.',
        fixed: [
            'Promise-returning Type builders, partial builder failures, and failed or Promise-returning item initializers now suppress the complete Type-only menu attempt.',
            'Public menu item initializers still receive the exact native item immediately, and duplicate callback registrations now have independent idempotent disposers.',
            'Composed file, folder, tag, and property menus preserve already-committed synchronous actions while observing rejected Promises and ignoring delayed additions.'
        ]
    },
    {
        version: '4.9.0',
        date: '2026-08-01',
        showOnUpdate: true,
        info: 'Integrations can now add guarded actions to the actual items rendered inside Navigator result lists.',
        new: [
            'Public API `2.10.0` adds `menus.registerRowMenu(...)` for attached rows plus Notes, Checkboxes, Bullets, Headings, dynamic Kinds, and provider-owned Type results.',
            'Each action receives a frozen current-file target with row identity, optional zero-based source line, selected Type id, and checkbox presentation.'
        ],
        improved: [
            'An optional `supports(target)` filter keeps action affordances off unrelated rows, while stale files, empty builders, delayed additions, and integration failures fail closed.',
            'Desktop right-click, native mobile long-press, and the keyboard-accessible More actions button now compose row-owner and registered integration actions through one guarded path.'
        ]
    },
    {
        version: '4.8.0',
        date: '2026-08-01',
        showOnUpdate: true,
        info: 'Type collections can now expose integration-owned actions directly from the navigation pane.',
        new: [
            'Public API `2.9.0` adds `menus.registerTypeMenu(...)` for built-in, dynamic Kind, and provider-owned Type collections.',
            'Right-click and native mobile long-press on a Type collection now route the same current Type id and immutable descriptor to registered integrations.'
        ],
        improved: [
            'Removed and empty integrations leave no stale or blank collection menu; thrown and rejected failures are isolated, and delayed additions are ignored.'
        ]
    },
    {
        version: '4.7.1',
        date: '2026-08-01',
        showOnUpdate: true,
        info: 'Types navigation now shows every matching built-in item and stays easy to find after an upgrade.',
        fixed: [
            'Notes, Checkboxes, Bullets, Headings, and GCM Kind collections are no longer silently truncated at the external-provider 1,000-row safety limit.',
            'Legacy saved navigation orders now insert a missing Types section immediately after Folders while preserving every other customized section placement.'
        ]
    },
    {
        version: '4.7.0',
        date: '2026-08-01',
        showOnUpdate: true,
        info: 'External integrations can now reconnect automatically after a TPS Notebook Navigator-only reload.',
        new: [
            'Public API `2.8.0` adds TPS-namespaced availability announcements and a point-to-point request handshake for the current host API instance.'
        ],
        improved: [
            'Long-lived Rows and Types providers can release stale registration handles before shutdown and bind to the replacement API without polling or persisted provider state.'
        ]
    },
    {
        version: '4.6.0',
        date: '2026-08-01',
        showOnUpdate: true,
        info: 'Other plugins can now establish their own top-level Type collections and guarded rows.',
        new: [
            'Public API `2.7.0` adds `types.registerProvider(...)` for runtime-owned collection catalogs, search-aware rows, options updates, and idempotent cleanup.',
            'External Type rows support the same source activation, checkbox indicator, and context-menu actions as existing provider rows.'
        ],
        improved: [
            'Provider ids are host-owned and collision-free, while catalogs and rows are visibility-bound, validated, cancellable, and protected by five-second timeouts.',
            'Readiness and removal authority are isolated per provider, so one failed integration cannot hide healthy Types and late plugin startup cannot erase restored selections.'
        ]
    },
    {
        version: '4.5.0',
        date: '2026-07-31',
        showOnUpdate: true,
        info: 'Type collections can now be discovered and selected through one provider-neutral public control surface.',
        new: [
            'The public `types` catalog exposes immutable structural and dynamic Kind descriptors, stable ids, Kind helpers, live subscriptions, and readiness states without leaking GCM records.',
            '`navigation.navigateToType(typeId)` opens the TPS Navigator and selects any discovered Type collection through public API `2.6.0`.'
        ],
        improved: [
            'Type clicks, public navigation, and back/forward history now share validation, ancestor expansion, focus, and scroll behavior.',
            'Valid restored Type ids remain provisional during index startup or a temporary integration outage and are rejected only when a complete catalog proves they are absent.'
        ]
    },
    {
        version: '4.4.0',
        date: '2026-07-31',
        showOnUpdate: true,
        info: 'Attached GCM tasks now have full action and task-state parity, with stronger co-install and upstream-sync safeguards.',
        new: [
            'Tasks shown beneath ordinary notes now expose the same guarded GCM task menu as task-backed Type rows on desktop and mobile.',
            'A read-only upstream merge audit reports changed-file overlap and classifies exact merge conflicts before any Git mutation.'
        ],
        improved: [
            'Provider checkbox markers now preserve working, holding, and other custom GCM states with accessible state labels.',
            'Task activation and menu construction re-resolve current optional GCM capabilities and fail closed when a task is stale.'
        ],
        fixed: [
            'Bundled dnd-kit described-by and live-region IDs now use TPS-only prefixes, preventing accessibility DOM collisions with a co-installed upstream Navigator.'
        ]
    },
    {
        version: '4.3.0',
        date: '2026-07-31',
        showOnUpdate: true,
        info: 'Type collections now support live GCM task controls and explicit external row-provider extensions.',
        new: [
            'Task entities in **Checkboxes** and dynamic Kind collections now expose live completion controls and the full guarded GCM task menu.',
            'External row providers can opt in to selected Type collections through the public Rows API.',
            'The public API is now version `2.5.0`, with Type row scopes, opaque selected Type ids, provider opt-in, and guarded menu separators.'
        ],
        improved: [
            'Task completion uses GCM configured mappings and validates the effective state before accepting optimistic UI.',
            'Provider-row virtualization now reserves the full two-line row height and keeps 44 px mobile controls from overlapping adjacent rows.'
        ],
        fixed: [
            'GCM task actions and external task changes now refresh Type checkbox state even when the Entity Index identity is unchanged.'
        ]
    },
    {
        version: '4.2.0',
        date: '2026-07-31',
        showOnUpdate: true,
        info: 'The navigation pane can now browse notes and indexed line entities by structural type or relational Kind.',
        new: [
            'A new **Types** section groups Notes, Checkboxes, Bullets, Headings, and every Kind exposed by TPS Global Context Menu Entity Index v3.',
            'Selecting a type shows its entities in a standalone virtualized list. Notes open directly, while line entities re-resolve and open at their current source line.',
            'The public Selection API is now version `2.4.0` and reports selected Types through an additive `type` navigation-item variant.'
        ],
        improved: [
            'Type counts and results follow the active Navigator visibility profile and hidden-items override.',
            'Type selection participates in history, keyboard navigation, persisted selection, search, and responsive navigation without exposing file-only actions.'
        ],
        fixed: ['Disabling Types now falls back to the vault root instead of restoring a hidden Types selection on startup.']
    },
    {
        version: '4.1.0',
        date: '2026-07-31',
        showOnUpdate: true,
        info: 'Provider rows can now expose their own guarded actions, and mixed providers refresh independently without making unrelated rows disappear.',
        new: [
            'Provider rows can add synchronous context-menu actions that open from desktop right-click, native mobile long-press, or an accessible **More actions** button.',
            'The public Rows API is now version `2.3.0` and gives action builders an immutable provider and row identity without exposing the host menu.'
        ],
        improved: [
            'Independent providers now stream results as they settle while preserving configured provider order and one shared 1,000-row safety ceiling.',
            'During a same-scope refresh, each unresolved provider keeps its previous rows until that provider settles, so a slow integration cannot make unrelated GCM or external rows flicker.'
        ],
        fixed: [
            'Action-capable provider rows no longer lose their right-click or long-press event to the list pane empty-area context menu.'
        ]
    },
    {
        version: '4.0.0',
        date: '2026-07-31',
        showOnUpdate: true,
        info: 'TPS Notebook Navigator is an experimental, co-installable fork. It can run beside upstream Notebook Navigator while keeping its own runtime and settings state.',
        new: [
            'New optional TPS Global Context Menu task rows can appear beneath the exact notes already present in the file list. Select a title to open its resolved source line, or use the checkbox to complete and reopen tasks when the installed GCM API supports mutations.',
            'New generic row-provider registry isolates provider failures and leaves ordinary file navigation unchanged when an integration is disabled or unavailable.',
            'New explicit one-way upstream settings import copies recognized settings only after confirmation. It never changes upstream Notebook Navigator state.'
        ],
        changed: [
            'Plugin views, commands, icons, events, drag payloads, DOM classes, CSS variables, Style Settings, local storage, IndexedDB, settings transfers, and release checks now use TPS-owned identities.',
            'Task checkboxes stay display-only with older compatible GCM builds that do not expose task mutation.',
            'Large task lists load in bounded progressive passes with fair per-note allocation and a global row safety ceiling.'
        ]
    },
    {
        version: '3.3.1',
        date: '2026-08-03',
        showOnUpdate: true,
        new: [
            'New search syntax: quoted literal terms. A search term that opens with a double quote is matched literally against note names and aliases instead of being read as a filter. For example, `".F"` finds notes with `.F` in the name, while unquoted `.F` still filters on properties starting with `f`. Use `-".F"` to exclude matches. Previously, quotes around a term were ignored, so `"#work"` behaved like the tag filter `#work`.',
            'New file context menu options in the `Copy` submenu: `Copy note link` copies a link to the file (`[[link]]`), `Copy note link as footnote` copies the link wrapped in an inline footnote (`^[[[link]]]`), and `Copy note embed` copies the link as an embed that displays the file content inline (`![[link]]`).'
        ],
        changed: [
            'I finally took the time to clean up the Style Settings panel. Settings are now grouped by pane and element, and border settings sit next to the elements they style. The navigation pane sliders `Default folder/tag weight`, `Default file name weight`, `Custom color folder/tag weight`, `Custom color file name weight`, and `Folder note weight` are merged into ==Name weight== and ==Custom color name weight==, which apply to all names in the navigation pane. Saved values are not affected.'
        ],
        fixed: [
            'When a note had a creation date in the future (for example from a frontmatter `created` property), the `Previous 7 days` group header appeared twice in the list pane, and stray headers then showed up in other folders until Obsidian was restarted. Notes dated in the future now group under a new `Future` group.'
        ]
    },
    {
        version: '3.3.0',
        date: '2026-07-29',
        showOnUpdate: true,
        videoUrl: true,
        videoClickable: true,
        info: 'Finally **dual pane support for iPads**! And much better **search results with Omnisearch**! You can now also quickly **collapse or expand all list pane groups** with a new command or toolbar button, and much more!\n\nThank you for using Notebook Navigator!',
        new: [
            'New on tablets: ==Dual pane layout==! Obsidian 1.13 introduced resizable sidebars - so Notebook Navigator now brings the full desktop experience to your iPad. Dual pane layout, desktop toolbars, multi-select, and keyboard navigation: everything available on desktop now works on tablets. Find the settings under Settings > Appearance & behavior.',
            'New grouping option: ==Group by property==, matching `Group by` in Obsidian Bases. The list pane can now group notes by a frontmatter property value: notes sharing the same value are collected under one header, and notes without the property go into a trailing `None` group. Each property listed under Settings > List pane > ==Property sort and grouping== appears as a grouping option in the sort menu, next to the existing date and folder grouping.',
            'New command: ==Collapse / expand all list groups==. When no groups are expanded, it expands all groups; otherwise, it collapses all groups, including the pinned section.',
            'New toolbar button: ==Collapse / expand all list groups==, added under Settings > List pane > Toolbar buttons. Disabled when the current list has no collapsible groups.',
            'New setting: Notes > ==Skip callouts in preview==. When enabled, callout blocks are skipped when generating preview text. Disabled by default.',
            'New setting: Calendar > ==Show hidden items==. When enabled, the calendar always shows all calendar notes, including notes hidden by vault profile filters. Disabled by default.'
        ],
        improved: [
            'Searching with Omnisearch inside a folder now reliably shows the matching notes from that folder. Omnisearch returns only its 50 best matches for the whole vault, so Notebook Navigator narrows the search to the selected folder. Previously this only worked for folders with plain names - in folders with special characters or non-English letters, such as `Möten`, the search still covered the whole vault, and the result list could be incomplete or empty, especially in large vaults. Update Omnisearch to 1.30.0 or later to get this in every folder.',
            'During list pane search, group header item counts now show matching and total items, such as `12/20`.',
            'You can now click anywhere on group headers in the list pane to collapse or expand them, not just the chevron.'
        ],
        changed: [
            'The calendar in the right sidebar now uses a calendar icon in the tab header. You can change this to a custom icon under Settings > Appearance & behavior > ==Interface icons== > Calendar.',
            'The collapsed state of the pinned section is now stored per device and no longer syncs across devices, matching the collapsed state of list groups.',
            'The ==Toolbar buttons== setting to enable / disable toolbar buttons moved from Appearance & behavior to the top of the Navigation pane and List pane tabs.'
        ],
        fixed: [
            'Fixed reinstalling the plugin on the same device showing the `Notebook Navigator could not read its settings and did not start` notice. Enabling the plugin without a settings file now shows a confirmation dialog and starts with default settings after confirmation.',
            'Fixed the preview in the `Change icon` and `Change color` dialog coloring both the icon and the name when ==Apply color to icons only== was enabled. The preview now colors only the icon, and items without a custom icon show their default icon so you can see the color.',
            'Fixed clicking the name of a folder with a folder note opening the note without expanding the folder, even when ==Expand on selection== was enabled.',
            'Fixed new notes not being selected when they got the same name as a note you had just renamed. For example, after renaming a note called `Untitled`, creating a new note kept the renamed note selected instead of the new `Untitled` note.',
            "Fixed the Navigator jumping to the destination folder when moving a note with Obsidian's `Move current file to another folder` command, even though ==Auto-reveal active note== was disabled.",
            'External files dropped into folders now preserve their original bytes instead of being rewritten as UTF-8.'
        ]
    },
    {
        version: '3.2.4',
        date: '2026-07-20',
        showOnUpdate: true,
        youtubeUrl: 'https://www.youtube.com/watch?v=m2maDNtho7Y',
        youtubePlayButton: { x: 80, y: 49, scale: 1.8 },
        info: 'We finally have a new **Mastering Notebook Navigator 3** video! In this one-hour long masterclass I go through everything you need to know about Notebook Navigator in 14 separate chapters. It took some time to record this, and I hope you find value in it.',
        new: [
            'Filter search now checks frontmatter aliases and all supported frontmatter properties, including properties that are not shown in Notebook Navigator. For example, `kickoff` finds a note with the alias `Project kickoff`, `.stat` finds the `status` property, and `.status=act` finds the value `active`. Matches are highlighted in the note list, and hidden properties are shown next to the note name. Exclusions such as `-kickoff` also check aliases. This change requires a one-time cache rebuild after updating. Sorry about that!',
            'You can now show item counts in the list pane group headers using the new setting: List pane > Group headers > ==Show item counts==. Disabled by default.'
        ],
        improved: [
            'Settings are no longer reset to defaults when the settings file is temporarily missing or unreadable, which can happen with some third party sync services. Startup retries the settings load for a short window, then shows a notice and keeps the plugin inactive until Obsidian is restarted. The new command `Restore default settings` replaces a damaged settings file with verified defaults after saving a timestamped copy to the plugin folder.',
            'If you are using a hardware keyboard with a mobile device, you can now use Tab, Shift+Tab, and the Left and Right arrow keys to move between the navigation and list panes.',
            'Excalidraw drawings now show preview text from the frontmatter properties listed in `Preview properties`.'
        ],
        changed: [
            'In the list pane, the parent folder label with ==Show folder path== enabled now shows the path relative to the selected folder instead of the full path. For example with the folder `Projects` selected, a note in `Projects/Clients/Acme` now shows `Clients/Acme`.'
        ],
        fixed: [
            'Fixed freshly downloaded icon packs appearing as square placeholder symbols in the icon picker until Obsidian was restarted.',
            'Calendar notes now follow vault profile visibility, including hidden folders and `Show hidden items` in the right sidebar.',
            'Fixed Cmd/Ctrl-click not opening note shortcuts and recent files in a new tab when Option/Alt was selected as the multi-select modifier.',
            'Fixed an issue where deleting notes could leave their tags showing in the tag tree. This happened when deleting a folder while a custom root folder order was set.',
            'Fixed custom group headers not showing word counts when note word count display was disabled.'
        ]
    },
    {
        version: '3.2.3',
        date: '2026-07-09',
        showOnUpdate: true,
        bannerUrl: true,
        info: 'After making startup much faster in 3.2.0, I took the time to go through everything that runs when you actually use the plugin: scrolling, switching folders, typing in notes, editing tags, and moving folders.\n\nRendering while scrolling is now 15-25% more efficient, switching folders builds the list about 60% faster, warm starts load storage about 5 times faster, background processing while typing is cut in half, and moving a folder now batches its database writes instead of writing every file separately.\n\nYou should notice these improvements in your daily use, especially if you have a large vault. Thank you for using Notebook Navigator!',
        new: [
            '**Calendar.** New setting: Calendar > ==Show tasks==. You can now hide the indicator on days, weeks, and months with unfinished tasks. Enabled by default.',
            '**Display filters.** New setting: Display filters > ==Exclude folders from descendants==. You can now exclude folders from showing when "Show files from subfolders" is enabled. Use it to hide folder content like periodic notes from parent folder lists while keeping the folders visible and selectable. You can also exclude folders directly with the new menu command `Hide from parents`.',
            '**Feature images.** SVG images are back as feature images again. SVG sources are now rasterized into cached thumbnails during content generation instead of rendering live in the list. SVG files that embed bitmap images are skipped.',
            '**Navigation banner.** SVG files can now also be selected as the navigation banner image.'
        ],
        improved: [
            '**Search.** The command `Search in vault root` was renamed to ==Search whole vault==. It now always includes notes from subfolders without changing the `Show notes from subfolders` setting.',
            '**Settings.** Importing settings now shows a confirmation dialog with an option to save current settings to a timestamped file in the vault root. Exported settings files now use timestamped filenames and record the plugin version. Import rejects JSON that is not a Notebook Navigator export or recognizable legacy settings diff.',
            '**Calendar.** Middle-click on day cells, week numbers, month, quarter and year headers, and the year panel opens the calendar note in a new tab, creating it if needed.',
            '**Feature images.** Thumbnails with transparent backgrounds, such as SVG or PNG images, no longer show an outline over transparent areas.',
            '**Performance.** Reduced work across list and navigation rendering, calendar updates, warm startup storage loading, note-save content generation, tag and property rebuilds, frontmatter date reads, folder note counts, bulk file operations, and PDF/SVG thumbnail moves.'
        ],
        fixed: [
            '**Drag and drop.** Fixed drag and drop not working on some Windows PCs where the system did not expose drag data during the drag operation.',
            '**Display filters.** Fixed entries in Display filters > Hide folders losing path segments when a folder moved to a different folder depth. Hidden tag patterns had the same issue when a tag rename changed depth. Patterns containing `name*` segments are left unchanged when the moved folder or renamed tag does not match them.',
            '**Editor tabs.** Fixed notes pinned in the editor opening again when selected from Notebook Navigator instead of reusing the existing main editor tab.'
        ]
    },
    {
        version: '3.2.2',
        date: '2026-06-30',
        showOnUpdate: false,
        info: 'Quick fix to make drag and drop work again with external images.'
    },
    {
        version: '3.2.1',
        date: '2026-06-29',
        showOnUpdate: true,
        bannerUrl: true,
        info: 'You can now **rename files, tags and properties inline** using Enter (macOS) or F2 (Windows and Linux)! And we got more optimizations! This release significantly reduces **preview work while typing** and also improves **drag and drop performance**. Previously there were lots of processing happening in the background every time Obsidian updated the current file when typing, now all actions are heavily gated.',
        new: [
            '**Inline rename.** ==Rename files, folders, tags, and properties inline== with Enter on macOS or F2 on Windows/Linux. The keyboard command is customizable with the `pane:rename` action.',
            '**Manual sort.** Manual-sort movement now uses the custom hotkey actions `list:manual-sort-up` and `list:manual-sort-down`. Defaults remain `Mod+ArrowUp` and `Mod+ArrowDown`.',
            '**File icons.** New setting: ==File icon preset== in Notes > Icons by file type. You can now pick default file icons from one of the installed icon packs.',
            '**Navigation pane.** New setting ==Skip vault root when collapsing== in Navigation pane > Collapse items. When collapsing all items, the vault root folder keeps its current state.'
        ],
        improved: [
            '**Navigation pane.** Root item spacing now supports values up to `12px`.',
            '**Performance.** Significantly improved drag and drop performance! Drag previews now use browser-native drag images instead of a JavaScript element that follows the pointer.',
            '**Performance.** Significantly improved performance when typing in the current note.'
        ],
        changed: [
            '**Merge notes.** Source notes are no longer moved to trash by default. Select the option in the merge dialog to move them to trash.'
        ],
        fixed: [
            '**Manual sort.** Fixed a problem with manual sort when **Show notes from subfolders / descendants** was enabled. For example, a parent folder could have note `1`, a subfolder with notes `2.0` and `2.1`, and then note `3`. After manually sorting the subfolder notes, the parent folder could show `2.0`, `2.1`, `1`, `3` instead of `1`, `2.0`, `2.1`, `3`. The parent folder now keeps the correct order after sorting notes inside the subfolder.',
            '**Properties.** Fixed property value assignment writing the display label instead of the original frontmatter link value. Values such as `[[Mini-Tasks]]` now keep the `Mini-Tasks` label while assigning writes `[[Mini-Tasks]]`.',
            '**List pane.** Fixed Reveal file not scrolling to notes inside collapsed list groups or the collapsed pinned section.'
        ]
    },
    {
        version: '3.2.0',
        date: '2026-06-21',
        showOnUpdate: true,
        bannerUrl: true,
        info: '**This release makes Notebook Navigator start MUCH faster!** Most feature code now loads the first time you use a feature instead of while Obsidian starts up, and several background tasks no longer run during plugin load. Many users will see almost a tenfold improvement to startup time.',
        new: [
            '==New icon and color picker!== Redesigned and merged the icon and color pickers into a unified panel with preview, saturation/value rectangle and a new hue slider.',
            'Added a ==Reveal file== button in the list pane toolbar. Default disabled, enable it with Settings > Appearance & behavior > Toolbar buttons.'
        ],
        improved: [
            '**Startup speed.** The code that runs commands now loads the first time you run a command instead of during startup.',
            '**Startup speed.** The navigator and calendar views now load their code when Obsidian opens them instead of during startup.',
            '**Startup speed.** The settings screen now loads when you open settings instead of during startup.',
            '**Startup speed.** Detecting folder notes no longer loads the full folder note creation and opening code during startup.',
            '**Startup speed.** The emoji keyword database now loads when you search emoji or show emoji icon names instead of during startup.',
            '**Startup speed.** External icon packs now initialize only when you have enabled or are managing them instead of during startup.',
            '**Startup speed.** Preview text now fills in when it is first shown instead of running a background scan during startup.',
            '**Startup speed.** Non-English languages now load their translation directly instead of loading English first and then merging.',
            '**Startup speed.** The version check no longer loads the full release notes during startup.',
            'Navigate to folder, Navigate to tag, and Navigate to property now keep the current single-pane view after selection.'
        ],
        fixed: ['**Calendar.** Fixed stale task indicators in the right-sidebar calendar when the main Notebook Navigator view was closed.']
    },
    {
        version: '3.1.4',
        date: '2026-06-15',
        showOnUpdate: true,
        videoUrl: true,
        videoClickable: true,
        new: [
            'When resizing the sidebar, Notebook Navigator can now automatically switch between dual pane, vertical split, and single pane. Configure this with ==When sidebar is too narrow== in Settings > Appearance & behavior > Desktop appearance.',
            'New setting ==One expanded branch== in Settings > Navigation pane. Enable to automatically collapse other branches in the same tree when expanding a folder, tag, or property.'
        ],
        improved: ['**Folder notes.** You can now use Canvas and Base files as templates for folder notes.'],
        fixed: [
            '**Navigation pane.** Pinned shortcuts disappeared on iOS/iPadOS because of a WebKit paint bug.',
            '**List pane.** Notes embedded in Canvas files were opening in a separate notes tab while typing.',
            '**List pane.** When grouping by subfolders, folder groups incorrectly got truncated to "MyF... / SubF..." instead of "MyFolder / Su...".'
        ]
    },
    {
        version: '3.1.2',
        date: '2026-06-07',
        showOnUpdate: false,
        new: [
            '**Settings.** New setting ==Folder grouping: current folder files at bottom== in List pane > Organization. Enable to show files in current folder on bottom when grouping by folder.'
        ],
        fixed: [
            '**Calendar.** Fixed quarterly note indicator alignment with monthly and yearly note indicators.',
            '**Calendar.** Fixed periodic note template buttons and descriptions initially missing in Obsidian 1.13.',
            '**Folder notes.** Fixed Templater integration for folder note templates. The Folder notes settings now also show Templater plugin status.',
            '**Folder notes.** Fixed right-sidebar folder note cleanup closing unrelated right sidebar panels. Users could see Properties, Backlinks, or other right sidebar panels close after toggling the pinned notes header or changing folders.',
            '**Build.** Added workaround for Obsidian code scanner incorrectly flagging properly implemented Obsidian 1.13 support as error.'
        ]
    },
    {
        version: '3.1.0',
        date: '2026-06-07',
        showOnUpdate: true,
        bannerUrl: true,
        bannerClickable: true,
        info: 'This version adds two fantastic new features: ==Open folder notes in right sidebar== and ==Right sidebar: Show closest folder note==. When these settings are enabled, selecting a folder will now automatically open its folder note or the closest ancestor folder note in the right sidebar! Super useful for scratch pads related to different areas of your vault.\n\nThis release also includes dozens of ==list pane and navigation pane performance improvements==. Notebook Navigator now does less work when scrolling and moving through notes, folders, tags and properties. Give it a try and let me know if you notice any difference!',
        new: [
            '**Commands.** New command ==Collapse / expand selected item== to toggle the selected navigation item.',
            '**Settings.** New setting ==Open folder notes in right sidebar== to Settings > Folders & folder notes.',
            '**Settings.** New setting ==Right sidebar: Show closest folder note==. When a folder is selected, the right sidebar automatically shows the nearest ancestor folder note.',
            '**Settings.** New setting ==Pinned notes icon== to Settings > Appearance & behavior > Interface icons. This icon is displayed next to the Pinned items group header if set, default not set.',
            '**Settings.** New setting ==Show subfolder paths== in List pane > Group headers. Default enabled, disable to only show folder names when grouping by folder.',
            '**Settings.** New setting ==Show leaders== in Navigation pane > Appearance. Choose dots, dashes, or a line between item names and note counts. Makes navigation pane look like a Table of Contents.',
            '**Style settings.** Two new style settings; ==Indent guide color and Leader color== to customize the colors of indent guides and leaders.'
        ],
        improved: [
            '**Folder notes.** The vault root can now have a folder note. Default naming uses the vault name.',
            '**List pane.** Individual folder group path segments are now clickable when subfolder paths are shown.',
            '**List pane.** Lots of rendering performance improvements in the list pane.',
            '**Navigation pane.** Lots of rendering performance improvements in the navigation pane.',
            '**Icon packs.** Simple Icons was updated to 16.22, adding 9 brand icons.'
        ],
        changed: [
            '**Feature images.** Breaking change! ==SVG images are no longer supported as feature images==. Large SVG images with embedded bitmaps were causing performance and memory issues for some users so this was disabled until further notice. As a result the cache will be rebuilt on startup.',
            '**List pane.** Standard mode now keeps the standard row layout when date, preview, and feature image are hidden. Compact layout is only used when list mode is Compact.'
        ],
        fixed: [
            '**Calendar.** Fixed Templater integration for notes created from the calendar.',
            '**List pane.** Fixed quick actions not reappearing after switching from Notebook Navigator to another left sidebar tab and back.',
            '**Commands.** Fixed Cmd+W accidentally closing Notebook Navigator after focusing the sidebar with the Notebook Navigator: Open command.'
        ]
    },
    {
        version: '3.0.2',
        date: '2026-05-29',
        showOnUpdate: true,
        bannerUrl: true,
        info: 'Settings search, finally! Obsidian 1.13 introduced a completely new Settings window that stays open and supports text search. All settings in Notebook Navigator have been meticulously rewritten to fully support this new structure, while still providing support for older versions like 1.11 and 1.12. Give it a try and let me know how you like it.',
        new: [
            '**Settings.** Notebook Navigator now support the new ==Obsidian 1.13 settings API==, including the new Settings dialog and settings search.'
        ],
        improved: [
            '**List pane.** File tag and property pills now follow the navigation pane sort order. Colored items are still showing first if that setting is enabled.',
            "**List pane.** Folder grouping now uses each file's actual parent folder. Descendant headers show the full path relative to the selected folder."
        ],
        fixed: [
            '**List pane.** Fixed parent folder labels missing from notes in property views when **Show parent folder** was enabled.',
            '**List pane.** Fixed delete selecting the wrong next note when folder grouping and descendant notes were enabled.'
        ]
    },
    {
        version: '3.0.1',
        date: '2026-05-26',
        showOnUpdate: true,
        bannerUrl: true,
        info: 'Notebook Navigator should start quickly on all devices. If you feel Notebook Navigator starts slowly, then please enable the new setting "Startup debug logging", restart, review the generated markdown file, and upload it to https://github.com/johansan/notebook-navigator as a bug report and I will take a look at it.',
        new: [
            '**List pane.** You can now ==merge notes in the list pane==! Right click several files or a group header to create a new note from selected files. You can also use it through the command "Merge notes".',
            '**List pane.** ==Files can show character counts==, with or without spaces. Enable it in Settings > Notes > Word and character count.',
            '**Startup.** New setting ==Startup debug logging==. Enable this in Advanced settings if you experience slow startup times, then review and upload the debug file to our GitHub page.'
        ],
        changed: [
            '**Settings.** Settings structure was rewritten for easier navigation. You can now navigate to all sub pages from the first settings page.'
        ],
        improved: [
            '**Shortcuts.** Search shortcuts can now be renamed from the context menu.',
            '**List pane.** The **Edit sort order...** mode now fully supports keyboard navigation, including CMD+arrow up / down.'
        ],
        fixed: [
            '**Navigation pane.** Fixed duplicated folder rows showing after folders were copied into the vault while Obsidian was open.'
        ]
    },
    {
        version: '3.0.0',
        date: '2026-05-18',
        showOnUpdate: true,
        info: 'This update finally brings manual sort to the list pane! If you are a writer used to working with Ulysses or Scrivener, this should make your daily life much easier.',
        youtubeUrl: 'https://youtu.be/OCx4v5gJkXE',
        new: [
            '**Manual sort.** ==New manual sorting mode in list pane.== You can now arrange notes in any order you want. The position is saved as a numeric index value in a frontmatter property, and works in single folders as well as with **Show notes from descendants** enabled.',
            '**Manual sort.** You can reorder notes directly in the list pane. Select one or more notes and press Cmd/Ctrl + Arrow Up/Down. Or pick **Edit sort order...** from the sort menu to open a dedicated drag-and-drop view, which supports multi-select on desktop and touch on mobile.',
            '**Manual sort.** New setting: List > Manual sort > ==New note placement== controls where new notes are added when manual sort is active: Top, Bottom, Below selected note, or Unsorted. Default is below selected note.',
            '**List pane.** ==Custom group headers==. Set group mode to "Custom" then create or edit group headers by right clicking files in list pane.',
            '**List pane.** ==Word count targets==. Custom group headers can show total word count and progress against a target word count, similar to writing targets in Scrivener.',
            '**List pane.** ==Group headers can now be collapsed.== Click the chevron next to a group header to collapse or expand it.',
            '**Recent files.** You can now drag items from recent files into shortcuts, folders, tags and properties.',
            '**Calendar.** New setting Calendar > Calendar integration > ==Periodic notes locale== controls whether Notebook Navigator periodic note paths use the selected calendar locale or Obsidian locale.'
        ],
        improved: [
            '**List pane.** ==Word count display== now supports title placement, property placement, target word counts, and target percentage display. Change it in List > Notes > Word count.'
        ],
        changed: [
            '**Settings.** "Property to sort by" was renamed to ==Properties to sort by==. It now takes a comma-separated list of frontmatter properties, and each one shows up as its own option in the list pane sort menu.'
        ],
        fixed: [
            '**Commands.** When **Notebook Navigator: Delete files** was called and the navigation pane was last focused, it could delete the selected folder. It now only deletes selected files.',
            '**Shortcuts.** Folder and note shortcuts no longer break when synced between devices with different path case sensitivity, for example **appLab/SKILLS-WORKFLOWS** vs **applab/skills-workflows**.',
            '**List pane.** Fixed extra spacing in feature image rows when dates are hidden and tags or properties are visible.',
            '**List pane.** Removed tiny hairline gap above the sticky group header showing on some scaling modes.'
        ]
    }
];

/**
 * Gets all release notes between two versions (inclusive).
 * Used when upgrading to show what's changed since the last version.
 *
 * @param fromVersion - The starting version (usually the previously shown version)
 * @param toVersion - The ending version (usually the current version)
 * @returns Array of release notes between the versions, or latest notes if versions not found
 */
export function getReleaseNotesBetweenVersions(fromVersion: string, toVersion: string): ReleaseNote[] {
    const fromIndex = RELEASE_NOTES.findIndex(note => note.version === fromVersion);
    const toIndex = RELEASE_NOTES.findIndex(note => note.version === toVersion);

    // If either version is not found, fall back to showing latest releases
    if (fromIndex === -1 || toIndex === -1) {
        return getLatestReleaseNotes();
    }

    const startIndex = Math.min(fromIndex, toIndex);
    const endIndex = Math.max(fromIndex, toIndex);

    return RELEASE_NOTES.slice(startIndex, endIndex + 1);
}

/**
 * Gets the most recent release notes.
 * Used for manual "What's new" access and as fallback.
 *
 * @param count - Number of latest releases to return (defaults to 5)
 * @returns Array of the most recent release notes
 */
export function getLatestReleaseNotes(count: number = 5): ReleaseNote[] {
    return RELEASE_NOTES.slice(0, count);
}

/**
 * Determines whether release notes for the given version should appear automatically on update.
 */
export function isReleaseAutoDisplayEnabled(version: string): boolean {
    const note = RELEASE_NOTES.find(entry => entry.version === version);
    if (!note) {
        return true;
    }
    return note.showOnUpdate !== false;
}

/**
 * Determines whether release notes should appear automatically when upgrading between two versions.
 *
 * Upgrade decision rule:
 * - Evaluate release notes in the semantic range (fromVersion, toVersion]
 * - Return true when at least one note in that range has showOnUpdate not explicitly set to false
 *
 * Range resolution:
 * - If both versions exist in RELEASE_NOTES, use their index range in the ordered list
 * - If either version is missing, resolve the range by semantic version comparisons
 *
 * Non-upgrade transitions (same version or downgrade) use the target version setting.
 */
export function shouldAutoDisplayReleaseNotesForUpdate(fromVersion: string, toVersion: string): boolean {
    if (compareVersions(toVersion, fromVersion) <= 0) {
        return isReleaseAutoDisplayEnabled(toVersion);
    }

    const fromIndex = RELEASE_NOTES.findIndex(note => note.version === fromVersion);
    const toIndex = RELEASE_NOTES.findIndex(note => note.version === toVersion);

    const releaseNotesInUpgradePath =
        fromIndex === -1 || toIndex === -1
            ? RELEASE_NOTES.filter(note => compareVersions(note.version, fromVersion) > 0 && compareVersions(note.version, toVersion) <= 0)
            : RELEASE_NOTES.slice(Math.min(fromIndex, toIndex), Math.max(fromIndex, toIndex));

    if (releaseNotesInUpgradePath.length === 0) {
        return isReleaseAutoDisplayEnabled(toVersion);
    }

    return releaseNotesInUpgradePath.some(note => note.showOnUpdate !== false);
}
