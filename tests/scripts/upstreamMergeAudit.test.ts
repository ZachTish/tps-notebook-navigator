import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(dirname, '../../scripts/upstream-merge-audit.mjs');
const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { force: true, recursive: true })));
});

function git(repository: string, args: string[]): string {
    return execFileSync('git', ['-c', 'gc.auto=0', '-c', 'maintenance.auto=0', ...args], {
        cwd: repository,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
}

async function writeFiles(repository: string, files: Record<string, string>): Promise<void> {
    await Promise.all(
        Object.entries(files).map(async ([relativePath, contents]) => {
            const absolutePath = path.join(repository, relativePath);
            await mkdir(path.dirname(absolutePath), { recursive: true });
            await writeFile(absolutePath, contents, 'utf8');
        })
    );
}

function commit(repository: string, message: string, paths: string[]): void {
    git(repository, ['add', '--', ...paths]);
    git(repository, ['commit', '--quiet', '-m', message]);
}

async function createDivergedRepository(): Promise<string> {
    const repository = await mkdtemp(path.join(os.tmpdir(), 'tps-upstream-audit-'));
    temporaryRoots.push(repository);
    git(repository, ['init', '--quiet', '--initial-branch=main']);
    git(repository, ['config', 'user.name', 'TPS Audit Test']);
    git(repository, ['config', 'user.email', 'audit@example.invalid']);

    const conflictPaths = ['styles.css', 'docs/guide.md', 'src/main.ts', 'tests/main.test.ts'];
    await writeFiles(repository, {
        'docs/guide.md': '# Guide\n\nBase documentation.\n',
        'src/main.ts': "export const value = 'base';\n",
        'styles.css': '.item {\n    color: black;\n}\n',
        'tests/main.test.ts': "const expected = 'base';\n",
        'zz-clean.txt':
            'fork-line: base\nstable: 1\nstable: 2\nstable: 3\nstable: 4\nstable: 5\nstable: 6\nstable: 7\nstable: 8\nupstream-line: base\n'
    });
    commit(repository, 'base', [...conflictPaths, 'zz-clean.txt']);
    git(repository, ['branch', 'upstream']);

    await writeFiles(repository, {
        'docs/guide.md': '# Guide\n\nFork documentation.\n',
        'src/fork-only.ts': 'export const forkOnly = true;\n',
        'src/main.ts': "export const value = 'fork';\n",
        'styles.css': '.item {\n    color: red;\n}\n',
        'tests/main.test.ts': "const expected = 'fork';\n",
        'zz-clean.txt':
            'fork-line: changed\nstable: 1\nstable: 2\nstable: 3\nstable: 4\nstable: 5\nstable: 6\nstable: 7\nstable: 8\nupstream-line: base\n'
    });
    commit(repository, 'fork changes', [...conflictPaths, 'src/fork-only.ts', 'zz-clean.txt']);

    git(repository, ['switch', '--quiet', 'upstream']);
    await writeFiles(repository, {
        'docs/guide.md': '# Guide\n\nUpstream documentation.\n',
        'src/main.ts': "export const value = 'upstream';\n",
        'src/upstream-only.ts': 'export const upstreamOnly = true;\n',
        'styles.css': '.item {\n    color: blue;\n}\n',
        'tests/main.test.ts': "const expected = 'upstream';\n",
        'zz-clean.txt':
            'fork-line: base\nstable: 1\nstable: 2\nstable: 3\nstable: 4\nstable: 5\nstable: 6\nstable: 7\nstable: 8\nupstream-line: changed\n'
    });
    commit(repository, 'upstream changes', [...conflictPaths, 'src/upstream-only.ts', 'zz-clean.txt']);
    git(repository, ['switch', '--quiet', 'main']);
    return repository;
}

describe('upstream merge audit', () => {
    it('reports changed-file overlap and classifies merge-tree conflicts without mutating Git state', async () => {
        const repository = await createDivergedRepository();
        const before = {
            objectCount: git(repository, ['count-objects', '-v']),
            refs: git(repository, ['show-ref']),
            status: git(repository, ['status', '--porcelain=v1'])
        };

        const result = spawnSync(process.execPath, [scriptPath, 'upstream'], {
            cwd: repository,
            encoding: 'utf8'
        });

        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).toContain('target-ref="upstream"');
        expect(result.stdout).toContain('files fork=6 upstream=6 overlap=5');
        expect(result.stdout).toContain('conflicts files=4 markers=4 generated=1 docs=1 source=1 test=1 other=0');
        expect(result.stdout).toContain('conflict category=generated markers=1 reasons=content path="styles.css"');
        expect(result.stdout).toContain('conflict category=docs markers=1 reasons=content path="docs/guide.md"');
        expect(result.stdout).toContain('conflict category=source markers=1 reasons=content path="src/main.ts"');
        expect(result.stdout).toContain('conflict category=test markers=1 reasons=content path="tests/main.test.ts"');
        expect({
            objectCount: git(repository, ['count-objects', '-v']),
            refs: git(repository, ['show-ref']),
            status: git(repository, ['status', '--porcelain=v1'])
        }).toEqual(before);
    });

    it('requires one explicit target ref before invoking Git', () => {
        const result = spawnSync(process.execPath, [scriptPath], {
            cwd: os.tmpdir(),
            encoding: 'utf8'
        });

        expect(result.status).toBe(2);
        expect(result.stdout).toBe('');
        expect(result.stderr).toBe('Usage: node scripts/upstream-merge-audit.mjs <upstream-ref>\n');
    });
});
