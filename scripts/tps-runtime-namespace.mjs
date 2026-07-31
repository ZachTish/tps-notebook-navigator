/*
 * TPS Notebook Navigator - merge-friendly runtime namespace transform.
 *
 * Inherited source deliberately keeps Notebook Navigator's upstream CSS/DOM
 * tokens. Build and test transforms apply the TPS namespace at module-load
 * boundaries, while generated styles are transformed after concatenation.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const upstreamShortPrefix = ['n', 'n-'].join('');
const upstreamRootSelector = ['.notebook', '-navigator'].join('');
const forkShortPrefix = 'tps-nn-';
const forkRootSelector = '.tps-notebook-navigator';
const scriptModuleExtensions = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);

function isPathInside(parentPath, candidatePath) {
    const relative = path.relative(parentPath, candidatePath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function loaderForPath(filePath) {
    const extension = path.extname(filePath);
    if (extension === '.tsx') {
        return 'tsx';
    }
    if (extension === '.ts' || extension === '.mts' || extension === '.cts') {
        return 'ts';
    }
    if (extension === '.jsx') {
        return 'jsx';
    }
    return 'js';
}

export function applyTpsRuntimeNamespace(source) {
    const shortPrefixPattern = new RegExp(`(?<!tps-)${upstreamShortPrefix}`, 'gu');
    return source.replace(shortPrefixPattern, forkShortPrefix).replaceAll(upstreamRootSelector, forkRootSelector);
}

export function createTpsRuntimeNamespaceEsbuildPlugin(projectRoot) {
    const sourceRoot = path.resolve(projectRoot, 'src');

    return {
        name: 'tps-runtime-namespace',
        setup(build) {
            build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async args => {
                if (!isPathInside(sourceRoot, args.path) || !scriptModuleExtensions.has(path.extname(args.path))) {
                    return null;
                }
                const source = await fs.readFile(args.path, 'utf8');
                return {
                    contents: applyTpsRuntimeNamespace(source),
                    loader: loaderForPath(args.path)
                };
            });
        }
    };
}

export function createTpsRuntimeNamespaceVitePlugin(projectRoot) {
    const sourceRoot = path.resolve(projectRoot, 'src');

    return {
        name: 'tps-runtime-namespace',
        enforce: 'pre',
        transform(source, id) {
            const filePath = id.split('?', 1)[0];
            if (!filePath || !isPathInside(sourceRoot, filePath) || !scriptModuleExtensions.has(path.extname(filePath))) {
                return null;
            }
            const transformed = applyTpsRuntimeNamespace(source);
            return transformed === source ? null : { code: transformed, map: null };
        }
    };
}
