# TPS Notebook Navigator

A separately namespaced TPS fork of Notebook Navigator, with shared GCM properties, entity integration, and stable list presentation.

Current release: [6.2.0](https://github.com/ZachTish/tps-notebook-navigator/releases/tag/6.2.0) · Obsidian 1.11.0+ · Desktop and mobile.

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
