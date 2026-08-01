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

import { App, MenuItem, TFile, TFolder } from 'obsidian';

/**
 * Notebook Navigator Public API Types
 *
 * These types are exposed to external plugins through the API.
 * The API consistently uses Obsidian's native types (TFile, TFolder)
 * rather than string paths for better type safety and integration.
 */

// ============================================================================
// COMMON TYPES
// ============================================================================

/**
 * Short icon provider prefixes used by Notebook Navigator frontmatter values.
 */
export type IconProviderPrefix = 'bi' | 'fas' | 'mi' | 'ph' | 'ra' | 'si';

/**
 * Typed short-provider icon input format used in frontmatter.
 * Bare Lucide slugs and bare emoji are accepted as plain strings.
 */
export type IconString = `${IconProviderPrefix}-${string}`;

/**
 * Icon input type accepted by public API setters.
 * Setters parse the same icon value format Notebook Navigator writes to frontmatter.
 */
export type IconInput = string;

/**
 * Icon value returned by public API getters and events.
 * Supported icons use the same value format as frontmatter: Lucide slug,
 * short provider-prefixed slug, or bare emoji.
 */
export type IconValue = string;

/**
 * Aggregate tag collection ids used by the navigator for virtual tag rows.
 */
export type TagCollectionId = '__tagged__' | '__untagged__';

// ============================================================================
// NAVIGATOR TYPES CATALOG (TPS FORK)
// ============================================================================

/** Availability of the optional first-class Types catalog. */
export type NavigatorTypesAvailability = 'disabled' | 'loading' | 'ready' | 'unavailable' | 'error';

/** Provider-neutral descriptor for one structural or relational Type collection. */
export interface NavigatorTypeDescriptor {
    /** Opaque ID accepted by Type navigation helpers. */
    readonly id: string;
    readonly label: string;
    readonly icon: string;
    readonly category: 'structure' | 'kind';
    /** Stable owner ID for a collection registered by another plugin. */
    readonly providerId?: string;
    /** Provider-local collection ID for a collection registered by another plugin. */
    readonly providerCollectionId?: string;
}

/** Immutable discovery snapshot for the first-class Types catalog. */
export interface NavigatorTypesSnapshot {
    readonly availability: NavigatorTypesAvailability;
    readonly descriptors: readonly NavigatorTypeDescriptor[];
    readonly revision: number;
    readonly message?: string;
}

/** Listener used by the Types catalog subscription API. */
export type NavigatorTypesListener = (snapshot: NavigatorTypesSnapshot) => void;

/** Immutable options owned by the plugin that registers a Type provider. */
export type NavigatorTypeProviderOptions = Readonly<Record<string, unknown>>;

/** One top-level Type collection exposed by an external provider. */
export interface NavigatorTypeCollectionDefinition {
    /** Stable provider-local lowercase slug. */
    readonly id: string;
    readonly label: string;
    readonly icon: string;
}

export interface NavigatorTypeProviderContext {
    readonly app: App;
}

export interface NavigatorTypeProviderQueryContext extends NavigatorTypeProviderContext {
    /** Aborted when a query is superseded, times out, unregisters, or unloads. */
    readonly signal: AbortSignal;
}

export interface NavigatorTypeRowsContext extends NavigatorTypeProviderQueryContext {
    /** Canonical host-owned Type ID selected in the Navigator. */
    readonly typeId: string;
    readonly searchQuery: string;
    /** Exact visible Markdown paths the provider may return rows for. */
    readonly allowedVaultFilePaths: readonly string[];
}

/**
 * Establishes one or more top-level Type collections and supplies their rows.
 * Returned rows use the same guarded DTO as the ordinary Rows API.
 */
export interface NavigatorTypeProvider {
    /** Stable namespaced ID in `vendor/name` form. */
    readonly id: string;
    getCollections(
        context: NavigatorTypeProviderQueryContext,
        options: NavigatorTypeProviderOptions
    ): Promise<readonly NavigatorTypeCollectionDefinition[]> | readonly NavigatorTypeCollectionDefinition[];
    getRows(
        collectionId: string,
        context: NavigatorTypeRowsContext,
        options: NavigatorTypeProviderOptions
    ): Promise<readonly NavigatorRowDefinition[]> | readonly NavigatorRowDefinition[];
    subscribe?(context: NavigatorTypeProviderContext, options: NavigatorTypeProviderOptions, invalidate: () => void): (() => void) | void;
}

export interface NavigatorTypeProviderRegistration {
    readonly id: string;
    /** Build the canonical ID for a valid local slug while this handle is active. */
    getTypeId(collectionId: string): string | null;
    /** Replace active options and refresh every open TPS Navigator view. */
    updateOptions(options: NavigatorTypeProviderOptions): void;
    /** Disable and unregister this provider. Safe to call repeatedly. */
    unregister(): void;
}

// ============================================================================
// TRANSIENT ROW PROVIDERS (TPS FORK)
// ============================================================================

export type NavigatorRowSelectionType = 'file' | 'folder' | 'tag' | 'property' | 'type';
export type NavigatorRowProviderOptions = Readonly<Record<string, unknown>>;

export interface NavigatorRowScope {
    /** Exact markdown paths represented by native items in the current list. */
    readonly visibleFilePaths: readonly string[];
    readonly selectionType: NavigatorRowSelectionType | null;
    readonly selectedFolderPath: string | null;
    readonly selectedTag: string | null;
    readonly selectedProperty: string | null;
    /** Opaque built-in, Kind, or registered-provider collection ID when `selectionType` is `type`. */
    readonly selectedType: string | null;
}

export interface NavigatorRowProviderContext {
    readonly app: App;
    readonly scope: NavigatorRowScope;
}

export interface NavigatorRowCheckboxIndicator {
    readonly type: 'checkbox';
    readonly checked: boolean;
    /** Source checkbox marker rendered verbatim, including non-binary task states such as `/` or `>`. */
    readonly marker?: string;
    /** Optional mutation. Omit it to render a display-only checkbox. */
    readonly onChange?: (checked: boolean) => void | Promise<void>;
}

/** Immutable identity and menu builder exposed when a provider row requests actions. */
export interface NavigatorRowContextMenuContext {
    readonly providerId: string;
    readonly rowId: string;
    readonly kind: string;
    readonly sourcePath: string;
    readonly sourceLineNumber?: number;
    /** Add menu items synchronously. Async work belongs inside each item's onClick handler. */
    readonly addItem: (cb: (item: MenuItem) => void) => void;
    /** Add a separator synchronously between provider-owned menu groups. */
    readonly addSeparator: () => void;
}

export interface NavigatorRowDefinition {
    /** Provider-local transient ID. */
    readonly id: string;
    /** Namespaced presentation kind, such as `example/task`. */
    readonly kind: string;
    readonly label: string;
    readonly secondaryLabel?: string;
    readonly tooltip?: string;
    /** Must exactly match one of `scope.visibleFilePaths`. */
    readonly sourcePath: string;
    /** Optional zero-based source line. */
    readonly sourceLineNumber?: number;
    readonly indicator?: NavigatorRowCheckboxIndicator;
    readonly activate?: () => void | Promise<void>;
    /** Optional synchronous builder for right-click, long-press, and keyboard-accessible row actions. */
    readonly contextMenu?: (context: NavigatorRowContextMenuContext) => void;
}

export interface NavigatorRowProvider {
    /** Stable namespaced ID in `vendor/name` form. */
    readonly id: string;
    /**
     * Opt in to standalone Type scopes. Providers without this flag retain the
     * pre-Type attached-row behavior and are never queried from a Type list.
     */
    readonly supportsTypeScope?: boolean;
    getRows(
        context: NavigatorRowProviderContext,
        options: NavigatorRowProviderOptions
    ): Promise<readonly NavigatorRowDefinition[]> | readonly NavigatorRowDefinition[];
    subscribe?(context: NavigatorRowProviderContext, options: NavigatorRowProviderOptions, invalidate: () => void): (() => void) | void;
}

// ============================================================================
// METADATA TYPES
// ============================================================================

/**
 * Metadata for customizing folder appearance in the navigator
 */
export interface FolderMetadata {
    /** CSS color value (hex, rgb, hsl, named colors) */
    color?: string;
    /** CSS background color value */
    backgroundColor?: string;
    /** Normalized icon identifier stored by the plugin */
    icon?: IconValue;
}

/**
 * Metadata for customizing tag appearance in the navigator
 */
export interface TagMetadata {
    /** CSS color value (hex, rgb, hsl, named colors) */
    color?: string;
    /** CSS background color value */
    backgroundColor?: string;
    /** Normalized icon identifier stored by the plugin */
    icon?: IconValue;
}

/**
 * Metadata for customizing property node appearance in the navigator
 */
export interface PropertyMetadata {
    /** CSS color value (hex, rgb, hsl, named colors) */
    color?: string;
    /** CSS background color value */
    backgroundColor?: string;
    /** Normalized icon identifier stored by the plugin */
    icon?: IconValue;
}

/**
 * Metadata update payload for folders
 */
export interface FolderMetadataUpdate {
    /** CSS color value. Use null to clear the stored value. */
    color?: string | null;
    /** CSS background color value. Use null to clear the stored value. */
    backgroundColor?: string | null;
    /** Canonical icon input. Use null to clear the stored value. */
    icon?: IconInput | null;
}

/**
 * Metadata update payload for tags
 */
export interface TagMetadataUpdate {
    /** CSS color value. Use null to clear the stored value. */
    color?: string | null;
    /** CSS background color value. Use null to clear the stored value. */
    backgroundColor?: string | null;
    /** Canonical icon input. Use null to clear the stored value. */
    icon?: IconInput | null;
}

/**
 * Metadata update payload for property nodes
 */
export interface PropertyMetadataUpdate {
    /** CSS color value. Use null to clear the stored value. */
    color?: string | null;
    /** CSS background color value. Use null to clear the stored value. */
    backgroundColor?: string | null;
    /** Canonical icon input. Use null to clear the stored value. */
    icon?: IconInput | null;
}

// ============================================================================
// PIN CONTEXT TYPES
// ============================================================================

/**
 * Context where a note can be pinned
 * - 'folder': Pin appears when viewing folders
 * - 'tag': Pin appears when viewing tags
 * - 'property': Pin appears when viewing properties
 * - 'all': Pin appears in folder, tag, and property views
 */
export type PinContext = 'folder' | 'tag' | 'property' | 'all';

/**
 * Type alias for the Map structure returned by the API for pinned notes
 * Maps file paths to their pinning context states
 */
export type Pinned = Map<string, Readonly<{ folder: boolean; tag: boolean; property: boolean }>>;

// ============================================================================
// EVENTS
// ============================================================================

/**
 * All available event types that can be subscribed to
 */
export type NotebookNavigatorEventType = keyof NotebookNavigatorEvents;

/**
 * Event payload definitions for each event type
 */
export interface NotebookNavigatorEvents {
    /** Fired when the storage system is ready for queries */
    'storage-ready': void;

    /** Fired when the navigation selection changes (folder, tag, property, or nothing) */
    'nav-item-changed': {
        item: NavItem;
    };

    /** Fired when selection changes in the list pane */
    'selection-changed': {
        state: SelectionState;
    };

    /** Fired when pinned files change */
    'pinned-files-changed': {
        /** All currently pinned files with their context information as a Map */
        files: Readonly<Pinned>;
    };

    /** Fired when folder metadata changes */
    'folder-changed': {
        folder: TFolder;
        metadata: FolderMetadata | null;
    };

    /** Fired when tag metadata changes */
    'tag-changed': {
        tag: string;
        metadata: TagMetadata | null;
    };

    /** Fired when property metadata changes */
    'property-changed': {
        nodeId: string;
        metadata: PropertyMetadata | null;
    };
}

// ============================================================================
// SELECTION STATE
// ============================================================================

export type NavItemType = 'folder' | 'tag' | 'property' | 'type' | 'none';

/**
 * Currently selected navigation item (folder, tag, property, TPS type, or none).
 *
 * `property` uses the property tree node id (`properties-root` for the section root,
 * or `key:<normalizedKey>` / `key:<normalizedKey>=<normalizedValuePath>` for key/value nodes).
 */
export type NavItem =
    | { type: 'folder'; folder: TFolder; tag: null; property: null }
    | { type: 'tag'; folder: null; tag: string; property: null }
    | { type: 'property'; folder: null; tag: null; property: string }
    | { type: 'type'; folder: null; tag: null; property: null; navigatorType: string }
    | { type: 'none'; folder: null; tag: null; property: null };

/**
 * Current file selection state
 */
export interface SelectionState {
    /** Array of currently selected files */
    files: readonly TFile[];
    /** The file that has keyboard focus (can be null) */
    focused: TFile | null;
}

export type FileMenuSelectionMode = 'single' | 'multiple';

export interface FileMenuExtensionContext {
    /** Add a menu item (must be called synchronously during menu construction) */
    addItem: (cb: (item: MenuItem) => void) => void;
    /** The file the menu was opened on */
    file: TFile;
    selection: {
        /** Effective selection mode for this menu */
        mode: FileMenuSelectionMode;
        /** Snapshot of files for this menu */
        files: readonly TFile[];
    };
}

export interface FolderMenuExtensionContext {
    /** Add a menu item (must be called synchronously during menu construction) */
    addItem: (cb: (item: MenuItem) => void) => void;
    /** The folder the menu was opened on */
    folder: TFolder;
}

export interface TagMenuExtensionContext {
    /** Add a menu item (must be called synchronously during menu construction) */
    addItem: (cb: (item: MenuItem) => void) => void;
    /** Canonical tag path, or a tag collection id for aggregate tag rows */
    tag: string;
}

export interface PropertyMenuExtensionContext {
    /** Add a menu item (must be called synchronously during menu construction) */
    addItem: (cb: (item: MenuItem) => void) => void;
    /** Property node id for the menu target */
    nodeId: string;
}

export type PropertyNodeParts =
    | {
          /** Root node returned for `propertyNodes.rootId` */
          kind: 'root';
          key: null;
          valuePath: null;
      }
    | {
          /** Key node without a value path */
          kind: 'key';
          /** Normalized property key */
          key: string;
          valuePath: null;
      }
    | {
          /** Key/value node */
          kind: 'value';
          /** Normalized property key */
          key: string;
          /** Normalized value path */
          valuePath: string;
      };
