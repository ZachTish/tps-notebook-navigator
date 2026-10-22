import { describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { choosePropertyDropMode, PropertyDropModal } from '../../src/modals/PropertyDropModal';

const host = vi.hoisted(() => {
    class Element {
        text = '';
        children: Element[] = [];
        onclick?: () => void;
        focused = false;
        setText(text: string) {
            this.text = text;
        }
        addClass() {}
        empty() {
            this.children = [];
        }
        focus() {
            this.focused = true;
        }
        createDiv() {
            const child = new Element();
            this.children.push(child);
            return child;
        }
        createEl(_tag: string, options: { text?: string }) {
            const child = this.createDiv();
            child.text = options.text || '';
            return child;
        }
    }
    const last: unknown = null;
    return { Element, last };
});
vi.mock('obsidian', async original => {
    const module = await original<Record<string, unknown>>();
    return {
        ...module,
        Modal: class {
            contentEl = new host.Element();
            titleEl = new host.Element();
            modalEl = new host.Element();
            constructor() {
                host.last = this;
            }
            onOpen() {}
            onClose() {}
            open() {
                this.onOpen();
            }
            close() {
                this.onClose();
            }
        }
    };
});

describe('property drop decision', () => {
    for (const choice of ['Add', 'Replace', 'Cancel', 'Dismiss'])
        it(`${choice} resolves once and clears the modal`, async () => {
            const promise = choosePropertyDropMode(new App(), 'kind', 'note', 3, 10);
            const modal = host.last as PropertyDropModal & { contentEl: InstanceType<typeof host.Element> };
            const content = modal.contentEl as unknown as InstanceType<typeof host.Element>;
            expect(content.children[0].text).toBe('3 of 10 notes already have values set for kind.');
            expect(content.children[1].text).toContain('Replace leaves only “note”');
            const buttons = content.children[2].children;
            expect(buttons.map(b => b.text)).toEqual(['Cancel', 'Replace', 'Add']);
            if (choice === 'Dismiss') modal.close();
            else buttons.find(b => b.text === choice)?.onclick?.();
            await expect(promise).resolves.toBe(choice === 'Add' ? 'add' : choice === 'Replace' ? 'replace' : null);
            expect(content.children).toHaveLength(0);
        });
});
