/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { App, Modal } from 'obsidian';
import { strings } from '../i18n';
import { runAsyncAction } from '../utils/async';
import { renderAffectedFilesPreview, type OperationUsageSummary } from '../services/operations/OperationBatchUtils';

interface PropertyKeyRenameModalOptions {
    propertyKey: string;
    affectedCount: number;
    sampleFiles: string[];
    initialValue?: string;
    onSubmit: (newKey: string, includeDescendants: boolean) => Promise<boolean> | boolean;
    valueRename?: {
        includeDescendants: boolean;
        getUsage: (includeDescendants: boolean) => OperationUsageSummary;
    };
}

/**
 * Modal dialog used to collect a new property key name and show affected files.
 */
export class PropertyKeyRenameModal extends Modal {
    private readonly propertyKey: string;
    private readonly affectedCount: number;
    private readonly sampleFiles: string[];
    private readonly initialValue: string;
    private readonly onSubmit: PropertyKeyRenameModalOptions['onSubmit'];
    private readonly valueRename: PropertyKeyRenameModalOptions['valueRename'];
    private includeDescendants = false;
    private submitting = false;

    private inputEl!: HTMLInputElement;
    private submitBtn!: HTMLButtonElement;

    constructor(app: App, options: PropertyKeyRenameModalOptions) {
        super(app);
        this.propertyKey = options.propertyKey;
        this.affectedCount = options.affectedCount;
        this.sampleFiles = options.sampleFiles;
        this.initialValue = options.initialValue ?? options.propertyKey;
        this.onSubmit = options.onSubmit;
        this.valueRename = options.valueRename;
        this.includeDescendants = options.valueRename?.includeDescendants ?? false;
    }

    onOpen(): void {
        const countLabel = this.affectedCount === 1 ? strings.modals.tagOperation.file : strings.modals.tagOperation.files;

        this.titleEl.setText(
            (this.valueRename ? strings.modals.propertyOperation.valueRenameTitle : strings.modals.propertyOperation.renameTitle).replace(
                '{property}',
                this.propertyKey
            )
        );

        const description = this.contentEl.createDiv('nn-tag-rename-description');
        description.setText(
            (this.valueRename ? strings.modals.propertyOperation.valueRenameWarning : strings.modals.propertyOperation.renameWarning)
                .replace('{property}', this.propertyKey)
                .replace('{count}', this.affectedCount.toString())
                .replace('{files}', countLabel)
        );

        const inputContainer = this.contentEl.createDiv('nn-tag-rename-input-container');
        const label = inputContainer.createEl('label', {
            text: this.valueRename ? strings.modals.propertyOperation.newValuePrompt : strings.modals.propertyOperation.newKeyPrompt
        });
        label.htmlFor = 'nn-property-rename-input';

        this.inputEl = inputContainer.createEl('input', {
            type: 'text',
            attr: { id: 'nn-property-rename-input' },
            value: this.initialValue,
            placeholder: this.valueRename
                ? strings.modals.propertyOperation.newValuePrompt
                : strings.modals.propertyOperation.newKeyPlaceholder
        });
        this.inputEl.addClass('nn-input');
        this.inputEl.addEventListener('input', () => this.updateSubmitState());

        const warning = this.contentEl.createEl('p', { text: strings.modals.tagOperation.modificationWarning });
        warning.addClass('nn-tag-rename-warning');

        const preview = this.contentEl.createDiv();
        const updateUsage = () => {
            const usage = this.valueRename?.getUsage(this.includeDescendants) ?? { total: this.affectedCount, sample: this.sampleFiles };
            if (this.valueRename) {
                description.setText(
                    strings.modals.propertyOperation.valueRenameWarning
                        .replace('{count}', String(usage.total))
                        .replace('{files}', usage.total === 1 ? strings.modals.tagOperation.file : strings.modals.tagOperation.files)
                );
            }
            preview.empty();
            renderAffectedFilesPreview(preview, usage);
        };
        if (this.valueRename) {
            const scopeLabel = this.contentEl.createEl('label', { cls: 'nn-tag-rename-description' });
            const checkbox = scopeLabel.createEl('input', { type: 'checkbox' });
            checkbox.checked = this.includeDescendants;
            scopeLabel.appendText(strings.modals.propertyOperation.includeNestedValues);
            checkbox.addEventListener('change', () => {
                this.includeDescendants = checkbox.checked;
                updateUsage();
            });
        }
        updateUsage();

        const buttonContainer = this.contentEl.createDiv('nn-button-container');
        const cancelBtn = buttonContainer.createEl('button', { text: strings.common.cancel });
        cancelBtn.addEventListener('click', () => this.close());

        this.submitBtn = buttonContainer.createEl('button', {
            text: this.valueRename ? strings.contextMenu.property.renameValue : strings.modals.propertyOperation.confirmRename,
            cls: 'mod-cta'
        });
        this.submitBtn.addEventListener('click', () => {
            runAsyncAction(() => this.handleSubmit());
        });

        this.scope.register([], 'Enter', event => {
            if (activeDocument.activeElement === this.inputEl) {
                event.preventDefault();
                runAsyncAction(() => this.handleSubmit());
            }
        });

        this.updateSubmitState();
        this.inputEl.focus();
        this.inputEl.select();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private updateSubmitState(): void {
        if (!this.submitBtn) {
            return;
        }

        const newValue = this.inputEl.value.trim();
        const disabled = this.submitting || newValue.length === 0;
        this.submitBtn.toggleClass('mod-disabled', disabled);
        this.submitBtn.disabled = disabled;
    }

    private async handleSubmit(): Promise<void> {
        const newKey = this.inputEl.value.trim();
        if (this.submitting || newKey.length === 0) {
            return;
        }

        this.submitting = true;
        this.updateSubmitState();
        try {
            if (await this.onSubmit(newKey, this.includeDescendants)) this.close();
        } finally {
            this.submitting = false;
            this.updateSubmitState();
        }
    }
}
