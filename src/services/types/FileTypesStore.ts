import type { App, EventRef } from 'obsidian';
import type { NavigatorTypesStore } from '../../api/modules/TypesAPI';
import type { TpsNavigatorTypesSnapshot } from '../../types/navigatorTypes';
import { buildVaultFileTypesSnapshot } from './vaultFileTypes';

/** File metadata only. No entity provider, task index, or file-body reads. */
export class FileTypesStore implements NavigatorTypesStore {
    private listeners = new Set<() => void>();
    private events: EventRef[] = [];
    private timer: ReturnType<typeof setTimeout> | null = null;
    private enabled = false;
    private revision = 0;
    private snapshot: TpsNavigatorTypesSnapshot = { availability: 'loading', descriptors: [], recordsByType: new Map(), revision: 0 };

    constructor(private readonly app: App) {}

    getSnapshot(): TpsNavigatorTypesSnapshot {
        return this.snapshot;
    }

    setEnabled(enabled: boolean): void {
        if (enabled === this.enabled) return;
        this.enabled = enabled;
        if (enabled && this.listeners.size) this.start();
        else this.stop();
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        if (this.enabled && this.listeners.size === 1) this.start();
        return () => {
            this.listeners.delete(listener);
            if (!this.listeners.size) this.stop();
        };
    }

    private start(): void {
        if (this.events.length) return;
        const refresh = () => {
            if (this.timer !== null) return;
            this.timer = setTimeout(() => {
                this.timer = null;
                this.refresh();
            }, 100);
        };
        this.events.push(this.app.vault.on('create', refresh), this.app.vault.on('delete', refresh), this.app.vault.on('rename', refresh));
        this.refresh();
    }

    private refresh(): void {
        if (!this.enabled || !this.listeners.size) return;
        this.snapshot = { ...buildVaultFileTypesSnapshot(this.app), revision: ++this.revision };
        for (const listener of this.listeners) listener();
    }

    private stop(): void {
        for (const event of this.events) this.app.vault.offref(event);
        this.events = [];
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
    }
}
