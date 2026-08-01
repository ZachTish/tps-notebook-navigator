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

export function stopProviderRowKeyboardPropagation(event: Pick<React.KeyboardEvent, 'stopPropagation'>): void {
    event.stopPropagation();
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

export const NavigatorProviderRow = React.memo(function NavigatorProviderRow({
    row,
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
        requestProviderRowActivation(row, onActivationRequested, error => {
            console.warn('[TPS Notebook Navigator] Provider row activation failed', {
                providerId: row.providerId,
                rowId: row.id,
                error
            });
        });
    }, [onActivationRequested, row]);
    const handleCheckboxChange = useCallback(() => {
        const onChange = row.indicator?.onChange;
        if (!onChange || checkboxBusy) {
            return;
        }

        const previousChecked = displayedChecked;
        const nextChecked = !previousChecked;
        runAsyncAction(() =>
            applyProviderCheckboxChange({
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
    }, [checkboxBusy, displayedChecked, row]);
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

            consumeProviderRowMenuEvent(
                () => showProviderRowContextMenuAtMouseEvent(new Menu(), row, event.nativeEvent, extensionAppender),
                event
            );
        },
        [createExtensionTarget, resolveExtensionAppender, row, rowMenuHost]
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
            consumeProviderRowMenuEvent(
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
        },
        [createExtensionTarget, resolveExtensionAppender, row, rowMenuHost]
    );
    const lineDescription = row.sourceLineNumber === undefined ? '' : `, line ${row.sourceLineNumber + 1}`;
    const checkboxLabel = displayedChecked ? 'Mark task incomplete' : 'Mark task complete';
    const markerForCurrentState = displayedChecked === sourceChecked ? sourceMarker : undefined;
    const checkboxPresentation = getProviderCheckboxPresentation(displayedChecked, markerForCurrentState);
    const interactiveCheckboxLabel = `${checkboxPresentation.stateLabel}. ${checkboxLabel}`;
    const checkboxClassName = `nn-provider-row-checkbox${displayedChecked ? ' is-checked' : ''}${
        checkboxPresentation.hasVisibleMarker ? ' has-marker' : ''
    }`;

    return (
        <div
            className="nn-provider-row"
            role="listitem"
            data-provider-id={row.providerId}
            data-provider-kind={row.kind}
            data-source-path={row.sourcePath}
            data-provider-context-menu={hasContextMenu ? 'true' : undefined}
            onContextMenu={handleContextMenu}
            onKeyDown={stopProviderRowKeyboardPropagation}
            onKeyUp={stopProviderRowKeyboardPropagation}
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
                aria-label={`Open ${row.label} in ${row.sourcePath}${lineDescription}`}
                onClick={handleActivate}
                disabled={!row.activate}
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
                >
                    <ObsidianIcon name="lucide-ellipsis-vertical" aria-hidden={true} />
                </button>
            ) : null}
        </div>
    );
});
