/*
 * TPS Notebook Navigator - neutral rendering for transient provider rows.
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { NavigatorProvidedRow } from '../../services/rows/types';
import { runAsyncAction } from '../../utils/async';
import { showNotice } from '../../utils/noticeUtils';

interface NavigatorProviderRowProps {
    row: NavigatorProvidedRow;
}

interface ApplyProviderCheckboxChangeOptions {
    previousChecked: boolean;
    nextChecked: boolean;
    onChange: (checked: boolean) => void | Promise<void>;
    setDisplayedChecked: (checked: boolean) => void;
    setBusy: (busy: boolean) => void;
    onError: (error: unknown) => void;
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

export const NavigatorProviderRow = React.memo(function NavigatorProviderRow({ row }: NavigatorProviderRowProps) {
    const sourceChecked = row.indicator?.checked ?? false;
    const [displayedChecked, setDisplayedChecked] = useState(sourceChecked);
    const [checkboxBusy, setCheckboxBusy] = useState(false);

    useEffect(() => {
        setDisplayedChecked(sourceChecked);
        setCheckboxBusy(false);
    }, [row.id, row.providerId, sourceChecked]);

    const handleActivate = useCallback(() => {
        if (!row.activate) {
            return;
        }
        runAsyncAction(row.activate, {
            onError: error => {
                console.warn('[TPS Notebook Navigator] Provider row activation failed', {
                    providerId: row.providerId,
                    rowId: row.id,
                    error
                });
            }
        });
    }, [row]);
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
    const lineDescription = row.sourceLineNumber === undefined ? '' : `, line ${row.sourceLineNumber + 1}`;
    const checkboxLabel = displayedChecked ? 'Mark task incomplete' : 'Mark task complete';

    return (
        <div
            className="nn-provider-row"
            role="listitem"
            data-provider-id={row.providerId}
            data-provider-kind={row.kind}
            data-source-path={row.sourcePath}
            onKeyDown={stopProviderRowKeyboardPropagation}
            onKeyUp={stopProviderRowKeyboardPropagation}
        >
            {row.indicator?.type === 'checkbox' ? (
                row.indicator.onChange ? (
                    <button
                        type="button"
                        className={`nn-provider-row-checkbox is-interactive${displayedChecked ? ' is-checked' : ''}`}
                        role="checkbox"
                        aria-checked={displayedChecked}
                        aria-busy={checkboxBusy || undefined}
                        aria-label={checkboxLabel}
                        title={checkboxBusy ? 'Updating task…' : checkboxLabel}
                        disabled={checkboxBusy}
                        onClick={handleCheckboxChange}
                    >
                        <span aria-hidden="true">{displayedChecked ? '✓' : ''}</span>
                    </button>
                ) : (
                    <span
                        className={`nn-provider-row-checkbox${displayedChecked ? ' is-checked' : ''}`}
                        role="checkbox"
                        aria-checked={displayedChecked}
                        aria-readonly="true"
                        aria-label={displayedChecked ? 'Completed task' : 'Open task'}
                        title="Task state is display-only"
                    >
                        <span aria-hidden="true">{displayedChecked ? '✓' : ''}</span>
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
        </div>
    );
});
