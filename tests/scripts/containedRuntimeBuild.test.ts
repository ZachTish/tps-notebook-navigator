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

import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('build and deployment separation', () => {
    it.each([false, true])('executes the real config without deployment when workspace helpers exist: %s', async helperPresent => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tps-navigator-build-only-'));
        const parent = helperPresent ? path.join(root, 'Obsidian Plugin Test Vault', 'Plugin Development') : root;
        const checkout = path.join(parent, 'TPS-Notebook-Navigator');
        try {
            await mkdir(path.join(checkout, 'scripts'), { recursive: true });
            await mkdir(path.join(checkout, 'node_modules/esbuild'), { recursive: true });
            await copyFile(path.join(repoRoot, 'esbuild.config.mjs'), path.join(checkout, 'esbuild.config.mjs'));
            await copyFile(
                path.join(repoRoot, 'scripts/tps-runtime-namespace.mjs'),
                path.join(checkout, 'scripts/tps-runtime-namespace.mjs')
            );
            await writeFile(
                path.join(checkout, 'node_modules/esbuild/package.json'),
                JSON.stringify({ type: 'module', exports: './index.js' })
            );
            // Stub only compilation. Execute the actual build configuration and
            // its plugin hooks, including any accidentally reintroduced writer.
            await writeFile(
                path.join(checkout, 'node_modules/esbuild/index.js'),
                `
                import { writeFileSync } from 'node:fs';
                export default { async context(options) {
                    const hooks = [];
                    for (const plugin of options.plugins ?? []) plugin.setup({ onLoad() {}, onEnd(fn) { hooks.push(fn); } });
                    return { async rebuild() {
                        for (const hook of hooks) await hook({ errors: [] });
                        writeFileSync('build-result.json', JSON.stringify({ plugins: options.plugins.map(p => p.name), format: options.format }));
                    }, watch() { throw new Error('Unexpected watch'); } };
                } };
            `
            );
            if (helperPresent) {
                for (const filename of ['deploy-runtime.mjs', 'workspace-paths.mjs']) {
                    await writeFile(path.join(parent, filename), "throw new Error('Build imported a workspace deployment helper');");
                }
            }
            const runtime = path.join(root, '.obsidian/plugins/tps-notebook-navigator');
            await mkdir(runtime, { recursive: true });
            await writeFile(path.join(runtime, 'main.js'), 'preserved-runtime');
            await writeFile(path.join(runtime, 'data.json'), 'preserved-settings');
            const result = spawnSync(process.execPath, ['esbuild.config.mjs', 'production'], { cwd: checkout, encoding: 'utf8' });
            expect(result.status, result.stderr).toBe(0);
            expect(JSON.parse(await readFile(path.join(checkout, 'build-result.json'), 'utf8'))).toEqual({
                plugins: ['tps-runtime-namespace'],
                format: 'cjs'
            });
            expect(await readFile(path.join(runtime, 'main.js'), 'utf8')).toBe('preserved-runtime');
            expect(await readFile(path.join(runtime, 'data.json'), 'utf8')).toBe('preserved-settings');
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('does not retain the inherited unverified release workflow', async () => {
        await expect(access(path.join(repoRoot, '.github/workflows/release.yml'))).rejects.toMatchObject({ code: 'ENOENT' });
    });
});
