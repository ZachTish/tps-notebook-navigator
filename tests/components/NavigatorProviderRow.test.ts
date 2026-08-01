/* TPS Notebook Navigator - provider row accessibility and interaction rendering. */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
    NavigatorProviderRow,
    applyProviderCheckboxChange,
    requestProviderRowActivation,
    stopProviderRowKeyboardPropagation
} from '../../src/components/providerRows/NavigatorProviderRow';
import type { NavigatorProvidedRow } from '../../src/services/rows/types';

function row(
    onChange?: (checked: boolean) => void | Promise<void>,
    contextMenu?: NavigatorProvidedRow['contextMenu']
): NavigatorProvidedRow {
    return {
        providerId: 'tps/tasks',
        id: 'one',
        kind: 'tps/task',
        label: 'Review navigator',
        sourcePath: 'Inbox/Tasks.md',
        contextMenu,
        indicator: {
            type: 'checkbox',
            checked: false,
            onChange
        }
    };
}

describe('NavigatorProviderRow', () => {
    it('runs the first-party activation callback only for an actionable row', () => {
        const events: string[] = [];
        const activate = vi.fn(() => events.push('activate'));
        const onActivationRequested = vi.fn(() => events.push('collapse'));
        const onError = vi.fn();
        const actionableRow = { ...row(), activate };

        expect(requestProviderRowActivation(actionableRow, onActivationRequested, onError)).toBe(true);
        expect(onActivationRequested).toHaveBeenCalledOnce();
        expect(activate).toHaveBeenCalledOnce();
        expect(events).toEqual(['activate', 'collapse']);
        expect(onError).not.toHaveBeenCalled();

        onActivationRequested.mockClear();
        expect(requestProviderRowActivation(row(), onActivationRequested, onError)).toBe(false);
        expect(onActivationRequested).not.toHaveBeenCalled();
    });

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

    it('renders an accessible More actions button only when the provider supplies actions', () => {
        const withActions = renderToStaticMarkup(
            React.createElement(NavigatorProviderRow, {
                row: row(undefined, context => context.addItem(() => undefined))
            })
        );
        const withoutActions = renderToStaticMarkup(React.createElement(NavigatorProviderRow, { row: row() }));

        expect(withActions).toContain('class="tps-nn-provider-row-more"');
        expect(withActions).toContain('data-provider-context-menu="true"');
        expect(withActions).toContain('aria-label="More actions for Review navigator"');
        expect(withActions).toContain('aria-haspopup="menu"');
        expect(withActions).toContain('title="More actions"');
        expect(withoutActions).not.toContain('tps-nn-provider-row-more');
        expect(withoutActions).not.toContain('data-provider-context-menu');
    });

    it.each(['keydown', 'keyup'])('keeps pane-level keyboard shortcuts from consuming provider control %s events', () => {
        const stopPropagation = vi.fn();

        stopProviderRowKeyboardPropagation({ stopPropagation });

        expect(stopPropagation).toHaveBeenCalledOnce();
    });
});
