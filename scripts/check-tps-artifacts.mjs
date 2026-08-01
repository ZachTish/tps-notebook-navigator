#!/usr/bin/env node
/* Verifies the final BRAT artifacts keep the fork's host-global identity. */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TPS_DND_KIT_DESCRIBED_BY_PREFIX, TPS_DND_KIT_LIVE_REGION_PREFIX } from './tps-runtime-namespace.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
    throw new Error(`[TPS artifact identity] ${message}`);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

const [manifestText, packageText, main, styles] = await Promise.all(
    ['manifest.json', 'package.json', 'main.js', 'styles.css'].map(fileName => readFile(path.join(repositoryRoot, fileName), 'utf8'))
);
const manifest = JSON.parse(manifestText);
const packageJson = JSON.parse(packageText);

if (manifest.id !== 'tps-notebook-navigator' || packageJson.name !== manifest.id) {
    fail('manifest and package IDs are not the TPS plugin ID.');
}
if (manifest.version !== packageJson.version) {
    fail(`manifest/package versions differ (${manifest.version} vs ${packageJson.version}).`);
}

const upstreamShortPrefix = ['n', 'n-'].join('');
const upstreamRootSelector = ['.notebook', '-navigator'].join('');
const upstreamCssToken = new RegExp(`--${upstreamShortPrefix}|(?<!tps-)${upstreamShortPrefix}|\\${upstreamRootSelector}`, 'u');
// Minified local variable arithmetic can resemble the short class prefix;
// short-prefix coverage therefore comes from source + styles.
const upstreamMainToken = new RegExp(`--${upstreamShortPrefix}|\\${upstreamRootSelector}`, 'u');
if (upstreamCssToken.test(styles)) {
    fail('styles.css contains an upstream CSS/DOM namespace token.');
}
if (!styles.includes('.tps-notebook-navigator') || !styles.includes('.tps-nn-provider-row')) {
    fail('styles.css is missing the TPS root or provider-row surface.');
}

const forbiddenRuntimeIdentifiers = [
    'notebook-navigator-calendar',
    'notebook-navigator-folder-note-sidebar',
    'notebook-navigator-view',
    'notebook-navigator-mobile',
    'notebook-navigator-android',
    'notebook-navigator-ios',
    'notebook-navigator-ios-floating-toolbars',
    'notebook-navigator-visible',
    'application/x-notebook-navigator-tag',
    'application/x-notebook-navigator-property',
    'application/x-notebook-navigator-shortcut',
    'application/x-notebook-navigator-color',
    'notebook-navigator-svg-filters',
    'notebook-navigator-frosted',
    'notebooknavigator'
];
for (const identifier of forbiddenRuntimeIdentifiers) {
    if (new RegExp(`(?<!tps-)${escapeRegExp(identifier)}`, 'u').test(main)) {
        fail(`main.js contains the upstream runtime identifier ${identifier}.`);
    }
}
if (upstreamMainToken.test(main)) {
    fail('main.js contains an upstream CSS/DOM namespace token.');
}
if (!main.includes('tps-notebook-navigator') || !main.includes('tps-nn-')) {
    fail('main.js is missing the TPS runtime identity.');
}
if (main.includes('DndDescribedBy') || main.includes('DndLiveRegion')) {
    fail('main.js contains an upstream dnd-kit accessibility ID prefix.');
}
if (!main.includes(TPS_DND_KIT_DESCRIBED_BY_PREFIX) || !main.includes(TPS_DND_KIT_LIVE_REGION_PREFIX)) {
    fail('main.js is missing a TPS dnd-kit accessibility ID prefix.');
}

console.log(`[TPS artifact identity] ok version=${manifest.version}`);
