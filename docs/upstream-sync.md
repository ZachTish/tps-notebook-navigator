# Syncing TPS Notebook Navigator with upstream

TPS Notebook Navigator intentionally keeps the original Notebook Navigator as an independent, co-installable plugin. The fork-specific runtime identity is broad enough that upstream merges need a repeatable isolation pass, while optional TPS behavior stays in separate modules under `src/integrations`, `src/services/rows`, and `src/settings/tabs/TpsIntegration*`.

## One-time remote setup

The canonical upstream project is `https://github.com/johansan/notebook-navigator.git`. Add it as `upstream` when a fresh checkout has only the TPS `origin` remote:

```bash
git remote add upstream https://github.com/johansan/notebook-navigator.git
git fetch --tags origin upstream
```

Never point `origin` at upstream. Do not rebase or force-push the shared TPS `main` branch.

## Update workflow

1. Start from a clean, current TPS `main` and create a short-lived branch such as `sync/upstream-3.4.0`.
2. Fetch both remotes and merge the desired upstream tag or commit with `--no-commit`. Record that exact upstream ref in the eventual commit and release notes.
3. Resolve behavioral conflicts before adding new TPS behavior. Keep the TPS manifest ID, view IDs, storage/IndexedDB namespaces, events, drag types, API lookup, DOM/CSS namespace, settings-transfer ID, and update URL.
4. Run `npm run tps:namespace`. This idempotent codemod applies the mechanical CSS/DOM prefix changes to new upstream source and tests. Review its diff; it does not change plugin IDs, storage keys, URLs, or fork-specific behavior.
5. Run `npm run tps:namespace:check` and the focused identity, import, and row-provider tests. Then run the full test, type, lint, formatting, style, contained build, deployment, and side-by-side UI gates.
6. Verify both `notebook-navigator` and `tps-notebook-navigator` remain enabled together, use separate settings/storage, and can open their own views. Never automatically import or mutate upstream settings.

## Conflict map

- `src/constants/tpsIdentity.ts` is the source of truth for host-global fork identifiers.
- `tests/constants/tpsIdentity.test.ts` detects namespace and storage regressions.
- `scripts/tps-namespace.mjs` handles only mechanical CSS/DOM changes introduced by upstream.
- `src/services/settings/UpstreamSettingsImport.ts` remains explicit, confirmed, read-only toward upstream, and one-way into TPS settings.
- `src/services/rows` owns generic transient row composition; `src/integrations/gcm` is an optional adapter with no hard dependency.
- `esbuild.config.mjs` uses the test-vault-owned deployment helper only in the contained development workspace. Standalone source checks deliberately do not deploy.

If an upstream release changes any of these surfaces, update the central constant or adapter and its focused regression test instead of scattering a second fork-specific path through upstream code.
