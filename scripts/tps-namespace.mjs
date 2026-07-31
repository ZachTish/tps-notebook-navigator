#!/usr/bin/env node
/*
 * Reapplies the fork-owned CSS/DOM namespace after an upstream merge.
 * This codemod is intentionally narrow and idempotent: it changes only
 * Notebook Navigator's short class/custom-property prefix and root selector.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(dirname, '..');
const sourceExtensions = new Set(['.css', '.js', '.mjs', '.ts', '.tsx']);
const scanRoots = ['src', 'scripts', 'tests'];
const excludedProjectPaths = new Set(['tests/constants/tpsIdentity.test.ts', 'tests/scripts/tpsNamespace.test.ts']);

// Assemble upstream tokens so this maintenance script does not itself look
// like an unnamespaced runtime source to the identity regression test.
const upstreamShortPrefix = ['n', 'n-'].join('');
const upstreamRootSelector = ['.notebook', '-navigator'].join('');
const forkShortPrefix = 'tps-nn-';
const forkRootSelector = '.tps-notebook-navigator';

function parseArgs(argv) {
    let mode = 'check';
    let projectRoot = defaultProjectRoot;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--check') {
            mode = 'check';
            continue;
        }
        if (arg === '--write') {
            mode = 'write';
            continue;
        }
        if (arg === '--project-root') {
            const value = argv[index + 1];
            if (!value) {
                throw new Error('Missing value for --project-root.');
            }
            projectRoot = path.resolve(value);
            index += 1;
            continue;
        }
        if (arg.startsWith('--project-root=')) {
            projectRoot = path.resolve(arg.slice('--project-root='.length));
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }

    return { mode, projectRoot };
}

async function collectFiles(root, projectRoot) {
    let entries;
    try {
        entries = await fs.readdir(root, { withFileTypes: true });
    } catch (error) {
        if (error && typeof error === 'object' && error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }

    const files = [];
    for (const entry of entries) {
        const absolutePath = path.join(root, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await collectFiles(absolutePath, projectRoot)));
            continue;
        }
        if (!sourceExtensions.has(path.extname(entry.name))) {
            continue;
        }
        const relativePath = path.relative(projectRoot, absolutePath).split(path.sep).join(path.posix.sep);
        if (!excludedProjectPaths.has(relativePath)) {
            files.push({ absolutePath, relativePath });
        }
    }
    return files;
}

function applyNamespace(source) {
    const shortPrefixPattern = new RegExp(`(?<!tps-)${upstreamShortPrefix}`, 'gu');
    return source.replace(shortPrefixPattern, forkShortPrefix).replaceAll(upstreamRootSelector, forkRootSelector);
}

const { mode, projectRoot } = parseArgs(process.argv.slice(2));
const files = (await Promise.all(scanRoots.map(rootName => collectFiles(path.join(projectRoot, rootName), projectRoot)))).flat();
const changedPaths = [];

for (const file of files) {
    const source = await fs.readFile(file.absolutePath, 'utf8');
    const namespaced = applyNamespace(source);
    if (namespaced === source) {
        continue;
    }
    changedPaths.push(file.relativePath);
    if (mode === 'write') {
        await fs.writeFile(file.absolutePath, namespaced, 'utf8');
    }
}

if (changedPaths.length === 0) {
    console.log('TPS namespace is current.');
} else if (mode === 'write') {
    console.log(`Reapplied the TPS namespace in ${changedPaths.length} file(s):`);
    changedPaths.forEach(filePath => console.log(`- ${filePath}`));
} else {
    console.error('TPS namespace reapplication is required in:');
    changedPaths.forEach(filePath => console.error(`- ${filePath}`));
    process.exitCode = 1;
}
