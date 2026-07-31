/* TPS Notebook Navigator - repeatable upstream namespace codemod tests. */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(dirname, '../../scripts/tps-namespace.mjs');
const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function createFixture(): Promise<{ root: string; sourcePath: string }> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'tps-navigator-namespace-'));
    temporaryRoots.push(root);
    const sourceDirectory = path.join(root, 'src');
    await mkdir(sourceDirectory, { recursive: true });
    const sourcePath = path.join(sourceDirectory, 'Example.tsx');
    await writeFile(
        sourcePath,
        ["const root = '.notebook-navigator';", "const className = 'nn-file-row';", "const alreadyNamespaced = 'tps-nn-file-row';"].join(
            '\n'
        ),
        'utf8'
    );
    return { root, sourcePath };
}

function runScript(root: string, mode: '--check' | '--write') {
    return spawnSync(process.execPath, [scriptPath, mode, '--project-root', root], { encoding: 'utf8' });
}

describe('TPS namespace codemod', () => {
    it('reports upstream namespace tokens without changing files in check mode', async () => {
        const fixture = await createFixture();
        const before = await readFile(fixture.sourcePath, 'utf8');

        const result = runScript(fixture.root, '--check');

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('src/Example.tsx');
        expect(await readFile(fixture.sourcePath, 'utf8')).toBe(before);
    });

    it('rewrites only upstream tokens and is idempotent', async () => {
        const fixture = await createFixture();

        expect(runScript(fixture.root, '--write').status).toBe(0);
        const rewritten = await readFile(fixture.sourcePath, 'utf8');
        expect(rewritten).toContain('.tps-notebook-navigator');
        expect(rewritten).toContain('tps-nn-file-row');
        expect(rewritten.match(/tps-nn-file-row/gu)).toHaveLength(2);

        const secondRun = runScript(fixture.root, '--check');
        expect(secondRun.status).toBe(0);
        expect(secondRun.stdout).toContain('TPS namespace is current.');
    });
});
