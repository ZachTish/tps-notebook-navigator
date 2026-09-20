# TPS Notebook Navigator

A separately namespaced TPS fork of Notebook Navigator, with shared GCM properties, entity integration, and stable list presentation.

Current release: [6.4.0](https://github.com/ZachTish/tps-notebook-navigator/releases/tag/6.4.0) · Obsidian 1.11.0+ · Desktop and mobile.

## Install with BRAT

Add `ZachTish/tps-notebook-navigator` to BRAT. Use manual updates with `Latest`, or freeze an exact numeric tag for a controlled rollout. Each release supplies `main.js`, `manifest.json`, and `styles.css`; release notes record validation and artifact hashes. A published release is not evidence that any device has installed it.

## Install and use the TPS fork

Install this repository, **ZachTish/tps-notebook-navigator**, through BRAT. Its plugin ID is `tps-notebook-navigator`; it is co-installable with upstream `notebook-navigator`. This repository's releases are not upstream releases.

Upstream-settings import is an explicit, one-way, read-only import. It does not modify upstream settings or share plugin/view/command/storage identities. Existing note data is not copied into another vault.

## TPS integration

- GCM 2.3.0+ publishes configured property keys. Navigator 6.1.0+ adds them to each vault profile's property configuration. Existing ordering and per-key visibility remain authoritative; repeated imports do nothing.
- New keys appear in Properties navigation and file menus without adding every value to list rows. Removing a GCM field does not erase Navigator preferences or note data.
- Property sort/group changes retain the active editor's position while typing and commit on save/blur. Presentation refreshes preserve authored note fields.
- File types, folders, tags, properties, shortcuts, and views use their existing Navigator settings. Local appearance preferences retain their per-device persistence controls.

## Selection filtering (6.2.1)

**Filter tags by selection** and **Filter properties by selection** now both follow the selected folder, tag, or property key/value. Previously each switch ignored its own section, silently restoring the full tree when selecting a tag or property there. Enabled trees contain only tags, property keys, and values occurring on notes in that selection. Existing visibility and descendant rules still apply. Empty selections stay empty; disabling either switch restores that section independently. Global ordering is retained while the displayed tree is filtered.

These controls follow navigation selection, not the active note or search text. Tags and Properties roots represent the full visible note collection. Types retain their existing unscoped behavior. No settings keys, defaults, stored state, API, or layout changes are required; Obsidian 1.11.0+ remains supported. This is a backward-compatible patch to the existing filtering controls.

Validation: all 3,067 tests in 269 files passed, including folder, tag, property-key/value and empty scopes, matching values and tag memberships, global ordering, and disabled filters. Full ESLint passed with 24 existing advisory warnings; TypeScript, namespace, artifact, and operational-identity checks passed. A separate production-mode build deployed to the test vault and the plugin was explicitly reloaded. In Obsidian 1.14.2, synthetic notes confirmed selected-tag and selected-property filtering, scoped counts, and independent off/on commands restoring the unrelated tag/closed value. QA settings were restored and fixtures archived. The initial fresh-worktree test run lacked generated main.js; rebuilding and rerunning the full suite resolved both artifact-test failures. Final hashes are in the public release notes. iOS hardware is not tested; production installation remains the user's BRAT pull.

## Property notes (6.2.0)

Enable **Folders & navigation notes → Enable folder, tag and property notes** and **Names open matching notes**. Property key and value labels link to a unique Markdown filename anywhere in the vault, case-insensitively: `status` → `status.md`, and `project: xyz` → `xyz.md`. The destination need not contain the property, tags, or any frontmatter. Scalar and list values use the same property-tree labels. Names with spaces work. Matching uses the whole label; partial names, folder-path suffixes, aliases, and duplicate filenames are not guessed. Wiki-link values use their existing property-tree display label, not a new link-target resolver. No notes or properties are created or rewritten.

Click a linked name to open its note; click the icon/row to filter as before. Links appear in Properties, property shortcuts (including renamed shortcuts), and the selected list title. Enter on a selected property or focused link opens its note; middle-click opens a new tab. The existing navigation-note destination supports current tab, new tab, and right sidebar. **Open property note** in the context menu remains available when name links are off. Missing or ambiguous matches remain ordinary filter rows. File creation, rename, deletion, and folder moves refresh links without reloading. The shared transient filename index attaches vault listeners only while used; ordinary body edits do not trigger filename scans.

This additive minor release preserves settings keys/defaults, property filtering, note counts, and upstream isolation. No new destination, disclosure, schema field, migration, or mobile-specific layout is added; existing responsive rows and accessible note links are reused. No separate property-note creation/template action is included. Obsidian 1.11.0+ remains supported.

Validation: focused filename/index lifecycle, interaction, and existing tag-note/accessibility regressions; full declared tests; separate production-mode build and test-vault deployment. All 3,061 tests in 269 files passed. Native UI checks in Obsidian 1.14.1 confirmed key/value name activation, the context-menu action, preserved property scope and note bodies, and live duplicate/rename handling. Temporary preferences were restored and fixtures archived. The final artifact was explicitly reloaded after refreshing Obsidian’s cached manifest. Scoped and full ESLint, TypeScript, namespace, artifact, and operational-identity checks are recorded with SHA-256 hashes in the release notes. Pre-existing GCM catalog and artifact-test typing errors were corrected without changing the valid catalog contract; remaining lint warnings are existing advisory warnings. iOS hardware was not tested. Production updates remain the user's BRAT pull.

## Documentation and attribution

See [the preserved TPS and upstream reference](REFERENCE.md) for keyboard shortcuts, search syntax, appearance configuration, API links, import details, and historical release notes. Some entries describe earlier releases; use the current manifest and tagged release for compatibility.

This fork builds on [johansan/notebook-navigator](https://github.com/johansan/notebook-navigator). Upstream attribution and licensing remain in [LICENSE](LICENSE) and the reference. Report TPS-specific integration issues to this repository; verify upstream-only reports against upstream first.

## Development and repository policy

`main` is the stable source line. Numeric tags identify immutable released artifacts. This fork has no maintained `optimization` lane. Imported upstream topic branches are not TPS release channels.

The supported build lives inside `Obsidian Plugin Test Vault/Plugin Development`, with `TPS-Notebook-Navigator (Dev)` as the mapped stable source. These repositories depend on adjacent shared tooling including `deploy-runtime.mjs`; a standalone clone is not currently self-contained.

From the contained workspace, prepare dependencies using the shared helper, then run tests and a separate final build:

```sh
# From Plugin Development:
node ./prepare-dependencies.mjs "TPS-Notebook-Navigator (Dev)"
cd "TPS-Notebook-Navigator (Dev)"
npm test
npm run build
```

Dependencies stay in the vault's `.plugin-dev-cache.nosync` through a relative `node_modules` symlink. Use a clean, current checkout; preserve unrelated changes and never build an old dirty worktree into the test runtime. Stable builds deploy only shipped artifacts to the test vault. Optimization builds are build-only. Runtime `data.json`, secrets, caches, and session state never belong in Git.

Documentation-only maintenance does not create a new plugin version. Published release tags and assets are preserved. Do not rely on legacy version/release scripts without reviewing their current behavior. Production updates remain the user's BRAT handoff.

For prior feature details and release-specific evidence, see [REFERENCE.md](REFERENCE.md) and [GitHub releases](https://github.com/ZachTish/tps-notebook-navigator/releases). The September 16 cleanup changes documentation and repository metadata, not shipped behavior.

## 6.3.0 — Shared note creation opening (2026-09-20)

With TPS Global Context Menu 2.5.0+, new Markdown notes follow GCM's **Menus & surfaces → Note opening** preview/open/stay preference. Folder, tag, and property New note actions, Navigator's New note command, tag-note creation and ordinary Markdown folder-note creation use the shared post-creation API. Tag/property writes and manual-sort placement still finish before presentation. Explicit new-tab and special folder-note sidebar/split destinations keep their requested destination. Background `openFile: false` creation, existing-note navigation, periodic home/daily navigation, independent Templater commands, and non-Markdown resources retain their existing behavior.

Appearance & behavior replaces **Open new notes in new tab** with **After creating a note → Configure note opening** when the new GCM API exists. The legacy `createNewNotesInNewTab` key is retained for GCM's one-time migration and older/disabled-GCM fallback, but no longer overrides the shared preference. No Navigator schema migration or new persisted UI state is needed. All TPS namespace boundaries remain intact.

`utils/tpsNoteOpening.ts` feature-detects GCM's additive `api.ui.presentCreatedNote` and `openNoteOpeningSettings`. The handler receives only the created file path, source plugin ID, originating leaf, rename intent, and an explicit destination when requested. Provider errors acknowledge creation without triggering a second opening. Focused tests cover missing/old GCM, legacy-default suppression, explicit new-tab intent, non-Markdown fallback, and settings handoff. Full validation is `npm test`, `npm run lint`, and a separate `npm run build`, with shared-helper deployment and plugin reload in Obsidian Plugin Test Vault. Physical iPhone acceptance remains for the user's BRAT pull. Minimum Obsidian stays 1.11.0; this backward-compatible minor feature requires GCM 2.5.0 for the shared behavior.

Final validation: all 3,071 tests across 270 files passed; lint passed with 24 pre-existing warnings and no errors. The separate production build passed string/locale/type checks and deployed to the test vault. After the 6.3.0 reload, Navigator’s New note showed the shared name-focused preview while the embedded Calendar remained active. The settings handoff reached GCM’s Note opening controls. QA preferences were restored and synthetic files archived.


## 6.4.0 — Folder notes follow titles (2026-09-20)

Folder notes resolve by the direct child note's nonempty Markdown `title` property, independent of its filename and the display-name-field setting. Title keys and matching values are case-insensitive; surrounding title whitespace is ignored. Untitled notes, invalid/list/template-placeholder titles, Canvas, and Base files retain filename lookup. A valid title supersedes a stale matching filename. Duplicate matching titles within the folder do not select an arbitrary file. Lookup stays within the folder; nested notes do not become a parent's folder note.

The existing folder-note name pattern remains in effect. The root checks `Vault` first, then the actual vault name, so a root note titled `TishOS v0.2` may have an unrelated filename. Root display aliases do not redefine identity. Folder-note links still require folder notes and links enabled. Title lookup works independently of automatic filename syncing or GCM installation; GCM 2.5.1 separately corrects case-only title-to-filename syncing when Auto-rename is enabled.

Tree rows, headers, keyboard/menu actions, sidebar opening, recents, list hiding, counts, and folder styling all use the same metadata-aware resolver. Metadata changes refresh existing folder-note links without a reload. Counts resolve once per folder rather than scanning siblings per file. Explicit linking and folder renaming preserve an authored title's folder-note role; conversion derives the folder name from the title, and creation aligns a template's existing title with the intended folder note. No new settings or persisted UI schema are introduced. A title that deliberately differs from its folder-pattern name is no longer that folder's note; use a matching title to retain that role.

Regression coverage includes unrelated filenames, root/nested names and patterns, capitalization, metadata-only identity changes, missing/invalid titles, duplicate titles, and legacy filename fallback. Validation uses `npm test`, `npm run lint`, namespace/artifact/operational identity checks, and a separate `npm run build`, deployed only to Obsidian Plugin Test Vault and reloaded with the plugin command. Minimum Obsidian remains 1.11.0. This backward-compatible title lookup capability is a minor release; physical iPhone acceptance and the production BRAT pull remain user-owned.

Test-vault UI validation on 2026-09-20: with Auto-rename disabled, `Inbox/Title Folder QA 20260920/id-note.md` gained the folder link solely from its title. Navigator hid it from the list, reduced the count, and opened that exact file from the underlined tree label. Editing the title away removed the link and restored the file/count without reload. The GCM title dialog then renamed a separate `TishOS V0.2.md` fixture to `TishOS v0.2.md` on this Mac's case-insensitive filesystem, retaining the body. Temporary folder-note/auto-rename preferences were restored and fixtures archived. The final build/reload and artifact checks are recorded in the release notes.
