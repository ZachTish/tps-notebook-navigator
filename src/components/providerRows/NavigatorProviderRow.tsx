/*
 * TPS Notebook Navigator - neutral rendering for transient provider rows.
 */

import { Menu } from 'obsidian';
import React, { useCallback, useEffect, useState } from 'react';
import type { NavigatorRowMenuExtensionContext, NavigatorRowMenuTarget } from '../../api/types';
import type { NavigatorProvidedRow } from '../../services/rows/types';
import { runAsyncAction } from '../../utils/async';
import {
    showProviderRowContextMenuAtMouseEvent,
    showProviderRowContextMenuAtPosition
} from '../../utils/contextMenu/providerRowContextMenu';
import { showNotice } from '../../utils/noticeUtils';
import { ObsidianIcon } from '../ObsidianIcon';

interface NavigatorProviderRowProps {
    row: NavigatorProvidedRow;
    isSelected?: boolean;
    /** Returns false when the source-backed row is no longer selectable. */
    onSelectionRequested?: () => boolean;
    /** Internal first-party hook; omitted for ordinary external provider rows. */
    onActivationRequested?: () => void;
    /** Current host bridge for public actions supplied by plugins other than the row owner. */
    rowMenuHost?: NavigatorProviderRowMenuHost;
}

export interface NavigatorProviderRowMenuHost {
    /** Changes whenever registrations change so memoized rows refresh their action affordance. */
    readonly revision: number;
    createTarget(row: NavigatorProvidedRow, checkboxState: NavigatorRowMenuTarget['checkbox']): NavigatorRowMenuTarget | null;
    hasExtensions(target: NavigatorRowMenuTarget): boolean;
    appendExtensions(target: NavigatorRowMenuTarget, controls: Pick<NavigatorRowMenuExtensionContext, 'addItem' | 'addSeparator'>): boolean;
}

interface ApplyProviderCheckboxChangeOptions {
    previousChecked: boolean;
    nextChecked: boolean;
    onChange: (checked: boolean) => void | Promise<void>;
    setDisplayedChecked: (checked: boolean) => void;
    setBusy: (busy: boolean) => void;
    onError: (error: unknown) => void;
}

interface ApplySelectedProviderCheckboxChangeOptions extends ApplyProviderCheckboxChangeOptions {
    onSelectionRequested?: () => boolean;
}

interface ProviderCheckboxPresentation {
    marker: string;
    hasVisibleMarker: boolean;
    stateLabel: string;
}

/** Preserves provider-specific task markers while keeping a useful binary fallback. */
export function getProviderCheckboxPresentation(checked: boolean, marker?: string): ProviderCheckboxPresentation {
    const displayedMarker = marker ?? (checked ? '✓' : '');
    const normalizedMarker = displayedMarker.trim();
    const stateLabel =
        marker === undefined
            ? checked
                ? 'Completed task'
                : 'Open task'
            : normalizedMarker
              ? checked
                  ? `Completed task (${normalizedMarker})`
                  : `Task state ${normalizedMarker}`
              : checked
                ? 'Completed task'
                : 'Open task';

    return {
        marker: displayedMarker,
        hasVisibleMarker: normalizedMarker.length > 0,
        stateLabel
    };
}

/** Applies an optimistic checkbox mutation and guarantees rollback on failure. */
export async function applyProviderCheckboxChange({
    previousChecked,
    nextChecked,
    onChange,
    setDisplayedChecked,
    setBusy,
    onError
}: ApplyProviderCheckboxChangeOptions): Promise<void> {
    setDisplayedChecked(nextChecked);
    setBusy(true);
    try {
        await onChange(nextChecked);
    } catch (error) {
        setDisplayedChecked(previousChecked);
        onError(error);
    } finally {
        setBusy(false);
    }
}

/** Refuse a stale row before optimistic state or provider mutation begins. */
export async function applySelectedProviderCheckboxChange({
    onSelectionRequested,
    ...options
}: ApplySelectedProviderCheckboxChangeOptions): Promise<boolean> {
    if (!requestProviderRowSelection(onSelectionRequested)) {
        return false;
    }
    await applyProviderCheckboxChange(options);
    return true;
}

export function stopProviderRowKeyboardPropagation(event: Pick<React.KeyboardEvent, 'stopPropagation'>): void {
    event.stopPropagation();
}

export type ProviderRowKeyboardControl = 'primary' | 'checkbox' | 'menu';

/** Keep auxiliary controls isolated while the primary row control participates in list traversal. */
export function routeProviderRowKeyboardPropagation(
    control: ProviderRowKeyboardControl,
    event: Pick<React.KeyboardEvent, 'stopPropagation'>
): void {
    if (control !== 'primary') {
        stopProviderRowKeyboardPropagation(event);
    }
}

/** A missing callback means the standalone row is selectable; an explicit false rejects a stale source. */
export function requestProviderRowSelection(onSelectionRequested?: () => boolean): boolean {
    return onSelectionRequested?.() ?? true;
}

/** Consumes a pointer/keyboard event only after a non-empty menu was shown. */
export function consumeProviderRowMenuEvent(
    showMenu: () => boolean,
    event: Pick<React.SyntheticEvent, 'preventDefault' | 'stopPropagation'>
): boolean {
    if (!showMenu()) {
        return false;
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
}

/** Builds the checkbox snapshot that matches the state currently presented to the user. */
export function getProviderRowMenuCheckboxState(row: NavigatorProvidedRow, displayedChecked: boolean): NavigatorRowMenuTarget['checkbox'] {
    if (!row.indicator) {
        return null;
    }
    return {
        checked: displayedChecked,
        ...(displayedChecked === row.indicator.checked && row.indicator.marker !== undefined ? { marker: row.indicator.marker } : {})
    };
}

export function requestProviderRowActivation(
    row: NavigatorProvidedRow,
    onActivationRequested: (() => void) | undefined,
    onError: (error: unknown) => void
): boolean {
    if (!row.activate) {
        return false;
    }

    runAsyncAction(row.activate, { onError });
    onActivationRequested?.();
    return true;
}

/** Select first so a stale source cannot activate after reconciliation rejects it. */
export function requestSelectedProviderRowActivation(
    row: NavigatorProvidedRow,
    onSelectionRequested: (() => boolean) | undefined,
    onActivationRequested: (() => void) | undefined,
    onError: (error: unknown) => void
): boolean {
    return requestProviderRowSelection(onSelectionRequested) && requestProviderRowActivation(row, onActivationRequested, onError);
}

export const NavigatorProviderRow = React.memo(function NavigatorProviderRow({
    row,
    isSelected = false,
    onSelectionRequested,
    onActivationRequested,
    rowMenuHost
}: NavigatorProviderRowProps) {
    const sourceChecked = row.indicator?.checked ?? false;
    const sourceMarker = row.indicator?.marker;
    const [displayedChecked, setDisplayedChecked] = useState(sourceChecked);
    const [checkboxBusy, setCheckboxBusy] = useState(false);

    useEffect(() => {
        setDisplayedChecked(sourceChecked);
        setCheckboxBusy(false);
    }, [row.id, row.providerId, sourceChecked]);

    const handleActivate = useCallback(() => {
        requestSelectedProviderRowActivation(row, onSelectionRequested, onActivationRequested, error => {
            console.warn('[TPS Notebook Navigator] Provider row activation failed', {
                providerId: row.providerId,
                rowId: row.id,
                error
            });
        });
    }, [onActivationRequested, onSelectionRequested, row]);
    const handleCheckboxChange = useCallback(() => {
        const onChange = row.indicator?.onChange;
        if (!onChange || checkboxBusy) {
            return;
        }

        const previousChecked = displayedChecked;
        const nextChecked = !previousChecked;
        runAsyncAction(() =>
            applySelectedProviderCheckboxChange({
                onSelectionRequested,
                previousChecked,
                nextChecked,
                onChange,
                setDisplayedChecked,
                setBusy: setCheckboxBusy,
                onError: error => {
                    console.warn('[TPS Notebook Navigator] Provider row checkbox update failed', {
                        providerId: row.providerId,
                        rowId: row.id,
                        error
                    });
                    showNotice('Could not update this row.', { variant: 'warning' });
                }
            })
        );
    }, [checkboxBusy, displayedChecked, onSelectionRequested, row]);
    const createExtensionTarget = useCallback(
        () => rowMenuHost?.createTarget(row, getProviderRowMenuCheckboxState(row, displayedChecked)) ?? null,
        [displayedChecked, row, rowMenuHost]
    );
    const extensionTarget = createExtensionTarget();
    const hasRegisteredActions = extensionTarget ? rowMenuHost?.hasExtensions(extensionTarget) === true : false;
    const sourceIsCurrent = !rowMenuHost || extensionTarget !== null;
    const hasContextMenu = (Boolean(row.contextMenu) && sourceIsCurrent) || hasRegisteredActions;
    const resolveExtensionAppender = useCallback(() => {
        if (!rowMenuHost) {
            return undefined;
        }
        const currentTarget = createExtensionTarget();
        if (!currentTarget || !rowMenuHost.hasExtensions(currentTarget)) {
            return undefined;
        }
        return (controls: Pick<NavigatorRowMenuExtensionContext, 'addItem' | 'addSeparator'>) => {
            return rowMenuHost.appendExtensions(currentTarget, controls);
        };
    }, [createExtensionTarget, rowMenuHost]);
    const handleContextMenu = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if (rowMenuHost && !createExtensionTarget()) {
                return;
            }
            const extensionAppender = resolveExtensionAppender();
            if (!row.contextMenu && !extensionAppender) {
                return;
            }

            const shown = consumeProviderRowMenuEvent(
                () => showProviderRowContextMenuAtMouseEvent(new Menu(), row, event.nativeEvent, extensionAppender),
                event
            );
            if (shown) {
                onSelectionRequested?.();
            }
        },
        [createExtensionTarget, onSelectionRequested, resolveExtensionAppender, row, rowMenuHost]
    );
    const handleMoreActions = useCallback(
        (event: React.MouseEvent<HTMLButtonElement>) => {
            if (rowMenuHost && !createExtensionTarget()) {
                return;
            }
            const extensionAppender = resolveExtensionAppender();
            if (!row.contextMenu && !extensionAppender) {
                return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            const shown = consumeProviderRowMenuEvent(
                () =>
                    showProviderRowContextMenuAtPosition(
                        new Menu(),
                        row,
                        {
                            x: rect.left + rect.width / 2,
                            y: rect.bottom
                        },
                        extensionAppender
                    ),
                event
            );
            if (shown) {
                onSelectionRequested?.();
            }
        },
        [createExtensionTarget, onSelectionRequested, resolveExtensionAppender, row, rowMenuHost]
    );
    const lineDescription = row.sourceLineNumber === undefined ? '' : `, line ${row.sourceLineNumber + 1}`;
    const checkboxLabel = displayedChecked ? 'Mark task incomplete' : 'Mark task complete';
    const markerForCurrentState = displayedChecked === sourceChecked ? sourceMarker : undefined;
    const checkboxPresentation = getProviderCheckboxPresentation(displayedChecked, markerForCurrentState);
    const interactiveCheckboxLabel = `${checkboxPresentation.stateLabel}. ${checkboxLabel}`;
    const primaryActionLabel = `${row.activate ? 'Open' : 'Select'} ${row.label} in ${row.sourcePath}${lineDescription}${
        isSelected ? '. Current selection' : ''
    }`;
    const checkboxClassName = `nn-provider-row-checkbox${displayedChecked ? ' is-checked' : ''}${
        checkboxPresentation.hasVisibleMarker ? ' has-marker' : ''
    }`;

    return (
        <div
            className={`nn-provider-row${isSelected ? ' is-selected' : ''}`}
            role="listitem"
            aria-current={isSelected ? 'true' : undefined}
            data-provider-id={row.providerId}
            data-provider-kind={row.kind}
            data-source-path={row.sourcePath}
            data-provider-context-menu={hasContextMenu ? 'true' : undefined}
            onContextMenu={handleContextMenu}
        >
            {row.indicator?.type === 'checkbox' ? (
                row.indicator.onChange ? (
                    <button
                        type="button"
                        className={`${checkboxClassName} is-interactive`}
                        role="checkbox"
                        aria-checked={displayedChecked}
                        aria-busy={checkboxBusy || undefined}
                        aria-label={interactiveCheckboxLabel}
                        data-task-marker={checkboxPresentation.hasVisibleMarker ? checkboxPresentation.marker : undefined}
                        title={checkboxBusy ? 'Updating task…' : interactiveCheckboxLabel}
                        disabled={checkboxBusy}
                        onClick={handleCheckboxChange}
                        onKeyDown={event => routeProviderRowKeyboardPropagation('checkbox', event)}
                        onKeyUp={event => routeProviderRowKeyboardPropagation('checkbox', event)}
                    >
                        <span aria-hidden="true">{checkboxPresentation.marker}</span>
                    </button>
                ) : (
                    <span
                        className={checkboxClassName}
                        role="checkbox"
                        aria-checked={displayedChecked}
                        aria-readonly="true"
                        aria-label={checkboxPresentation.stateLabel}
                        data-task-marker={checkboxPresentation.hasVisibleMarker ? checkboxPresentation.marker : undefined}
                        title="Task state is display-only"
                    >
                        <span aria-hidden="true">{checkboxPresentation.marker}</span>
                    </span>
                )
            ) : null}
            <button
                type="button"
                className="nn-provider-row-open"
                title={row.tooltip}
                aria-label={primaryActionLabel}
                onClick={handleActivate}
                onKeyDown={event => routeProviderRowKeyboardPropagation('primary', event)}
                onKeyUp={event => routeProviderRowKeyboardPropagation('primary', event)}
            >
                <span className="nn-provider-row-label">{row.label}</span>
                {row.secondaryLabel ? <span className="nn-provider-row-secondary">{row.secondaryLabel}</span> : null}
            </button>
            {hasContextMenu ? (
                <button
                    type="button"
                    className="nn-provider-row-more"
                    aria-label={`More actions for ${row.label}`}
                    aria-haspopup="menu"
                    title="More actions"
                    onClick={handleMoreActions}
                    onKeyDown={event => routeProviderRowKeyboardPropagation('menu', event)}
                    onKeyUp={event => routeProviderRowKeyboardPropagation('menu', event)}
                >
                    <ObsidianIcon name="lucide-ellipsis-vertical" aria-hidden={true} />
                </button>
            ) : null}
        </div>
    );
});
