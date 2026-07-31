/* TPS Notebook Navigator - provider row accessibility and interaction rendering. */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
    NavigatorProviderRow,
    applyProviderCheckboxChange,
    stopProviderRowKeyboardPropagation
} from '../../src/components/providerRows/NavigatorProviderRow';
import type { NavigatorProvidedRow } from '../../src/services/rows/types';

function row(onChange?: (checked: boolean) => void | Promise<void>): NavigatorProvidedRow {
    return {
        providerId: 'tps/tasks',
        id: 'one',
        kind: 'tps/task',
        label: 'Review navigator',
        sourcePath: 'Inbox/Tasks.md',
        indicator: {
            type: 'checkbox',
            checked: false,
            onChange
        }
    };
}

describe('NavigatorProviderRow', () => {
    it('commits a successful optimistic checkbox mutation in busy-state order', async () => {
        const events: string[] = [];

        await applyProviderCheckboxChange({
            previousChecked: false,
            nextChecked: true,
            onChange: async checked => {
                events.push(`mutate:${checked}`);
            },
            setDisplayedChecked: checked => events.push(`display:${checked}`),
            setBusy: busy => events.push(`busy:${busy}`),
            onError: () => events.push('error')
        });

        expect(events).toEqual(['display:true', 'busy:true', 'mutate:true', 'busy:false']);
    });

    it('rolls back a failed optimistic checkbox mutation and reports the error', async () => {
        const events: string[] = [];
        const failure = new Error('mutation failed');

        await applyProviderCheckboxChange({
            previousChecked: false,
            nextChecked: true,
            onChange: async () => {
                throw failure;
            },
            setDisplayedChecked: checked => events.push(`display:${checked}`),
            setBusy: busy => events.push(`busy:${busy}`),
            onError: error => events.push(error === failure ? 'error:expected' : 'error:unexpected')
        });

        expect(events).toEqual(['display:true', 'busy:true', 'display:false', 'error:expected', 'busy:false']);
    });

    it('renders a keyboard-focusable checkbox when the provider supplies a mutation', () => {
        const markup = renderToStaticMarkup(React.createElement(NavigatorProviderRow, { row: row(vi.fn()) }));

        expect(markup).toContain('<button type="button"');
        expect(markup).toContain('role="listitem"');
        expect(markup).toContain('role="checkbox"');
        expect(markup).toContain('aria-checked="false"');
        expect(markup).toContain('aria-label="Mark task complete"');
        expect(markup).toContain('is-interactive');
        expect(markup).not.toContain('aria-readonly="true"');
    });

    it('retains a display-only checkbox for providers without a mutation', () => {
        const markup = renderToStaticMarkup(React.createElement(NavigatorProviderRow, { row: row() }));

        expect(markup).toContain('<span class="tps-nn-provider-row-checkbox"');
        expect(markup).toContain('aria-readonly="true"');
        expect(markup).toContain('title="Task state is display-only"');
        expect(markup).not.toContain('is-interactive');
    });

    it.each(['keydown', 'keyup'])('keeps pane-level keyboard shortcuts from consuming provider control %s events', () => {
        const stopPropagation = vi.fn();

        stopProviderRowKeyboardPropagation({ stopPropagation });

        expect(stopPropagation).toHaveBeenCalledOnce();
    });
});
