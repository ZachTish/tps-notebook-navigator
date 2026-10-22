import { App, Modal } from 'obsidian';
import { strings } from '../i18n';

export type PropertyDropMode = 'add' | 'replace';

/** One decision for an explicit drop, with no saved preference or background work. */
export class PropertyDropModal extends Modal {
    private result: PropertyDropMode | null = null;

    constructor(
        app: App,
        private readonly property: string,
        private readonly value: string,
        private readonly populated: number,
        private readonly total: number,
        private readonly resolve: (mode: PropertyDropMode | null) => void
    ) {
        super(app);
    }

    onOpen(): void {
        this.titleEl.setText(`Set ${this.property}: ${this.value}`);
        this.modalEl.addClass('nn-property-drop-modal');
        this.contentEl.createEl('p', {
            text: `${this.populated} of ${this.total} ${this.total === 1 ? 'note already has' : 'notes already have'} values set for ${this.property}.`
        });
        this.contentEl.createEl('p', {
            text: `Add keeps existing values and adds “${this.value}”. Replace leaves only “${this.value}”. This applies to all ${this.total} selected ${this.total === 1 ? 'note' : 'notes'}.`
        });
        const buttons = this.contentEl.createDiv('nn-button-container');
        buttons.createEl('button', { text: strings.common.cancel }).onclick = () => this.close();
        buttons.createEl('button', { text: 'Replace', cls: 'mod-warning' }).onclick = () => this.choose('replace');
        const add = buttons.createEl('button', { text: 'Add', cls: 'mod-cta' });
        add.onclick = () => this.choose('add');
    }

    private choose(mode: PropertyDropMode): void {
        this.result = mode;
        this.close();
    }

    onClose(): void {
        this.contentEl.empty();
        this.resolve(this.result);
    }
}

export function choosePropertyDropMode(
    app: App,
    property: string,
    value: string,
    populated: number,
    total: number
): Promise<PropertyDropMode | null> {
    return new Promise(resolve => new PropertyDropModal(app, property, value, populated, total, resolve).open());
}
