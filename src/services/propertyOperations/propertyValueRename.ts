import { matchesPropertyValuePath, normalizePropertyTreeValuePath } from '../../utils/propertyTree';
import { parsePropertyLinkTarget } from '../../utils/propertyUtils';
import { casefold } from '../../utils/recordUtils';

export interface PropertyValueRename {
    key: string;
    oldValue: string;
    newValue: string;
    includeDescendants: boolean;
}

/** Same membership semantics as the property tree; never rewrites nested objects or note bodies. */
export function replacePropertyValue(value: unknown, rename: PropertyValueRename): unknown {
    if (Array.isArray(value)) {
        const next = value.map(entry => replacePropertyValue(entry, rename));
        if (next.every((entry, index) => entry === value[index])) return value;
        // Merge only collisions introduced by this rename. Leave unrelated existing duplicates intact.
        const untouched = new Set(next.filter((entry, index) => entry === value[index]));
        const introduced = new Set<unknown>();
        return next.filter((entry, index) => {
            if (entry === value[index]) return true;
            if (untouched.has(entry) || introduced.has(entry)) return false;
            introduced.add(entry);
            return true;
        });
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return value;
    if (typeof value === 'number' && !Number.isFinite(value)) return value;
    const raw = String(value);
    const oldPath = normalizePropertyTreeValuePath(rename.oldValue);
    const path = normalizePropertyTreeValuePath(raw);
    if (!oldPath || !matchesPropertyValuePath(path, oldPath, rename.includeDescendants, raw)) return value;
    const target = rename.newValue.trim();
    if (!target || /[\r\n]/.test(target)) throw new Error('invalid-property-value');
    if (typeof value === 'number') {
        if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(target) || !Number.isFinite(Number(target))) {
            throw new Error('invalid-property-value');
        }
        return Number(target);
    }
    if (typeof value === 'boolean') {
        if (!/^(true|false)$/i.test(target)) throw new Error('invalid-property-value');
        return target.toLowerCase() === 'true';
    }
    const suffix = path === oldPath ? '' : `/${raw.trim().split('/').slice(oldPath.split('/').length).join('/')}`;
    if (suffix && parsePropertyLinkTarget(target)) throw new Error('invalid-property-value');
    return target + suffix;
}

/** Compute replacements without changing the supplied metadata/source. */
export function collectPropertyValueReplacements(frontmatter: Record<string, unknown>, rename: PropertyValueRename): Map<string, unknown> {
    const replacements = new Map<string, unknown>();
    for (const key of Object.keys(frontmatter)) {
        if (casefold(key) !== casefold(rename.key)) continue;
        const next = replacePropertyValue(frontmatter[key], rename);
        if (next !== frontmatter[key]) replacements.set(key, next);
    }
    return replacements;
}
