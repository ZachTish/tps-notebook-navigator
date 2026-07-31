# Notebook Navigator Theming Guide

Updated: July 9, 2026

## Table of Contents

- [Introduction](#introduction)
- [CSS Variables Reference](#css-variables-reference)
  - [Theme foreground](#theme-foreground)
  - [Calendar](#calendar)
  - [Navigation pane](#navigation-pane)
  - [Borders](#borders)
  - [Pane divider](#pane-divider-desktop-only)
  - [List pane (files)](#list-pane-files)
  - [Headers (desktop only)](#headers-desktop-only)
  - [Mobile styles](#mobile-styles)
- [Complete Theme Example](#complete-theme-example)
- [Advanced Techniques](#advanced-techniques)
  - [Supporting Light and Dark Modes](#supporting-light-and-dark-modes)
  - [User Custom Colors Override](#user-custom-colors-override)
- [Style Settings Support](#style-settings-support)

## Introduction

Notebook Navigator is themed with CSS variables (custom properties). Themes and snippets override these variables to
match the rest of the theme.

The Style Settings plugin exposes most `--tps-nn-theme-*` variables under “TPS Notebook Navigator”.

Authored CSS lives in `src/styles/index.css` and `src/styles/sections/*`. `styles.css` is generated output. Regenerate
styles with `npm run build:styles` or `./scripts/build.sh`. `src/constants/notebookNavigatorIcon.ts` is generated from
`icon.svg` via `npm run build:icons`.

## CSS Variables Reference

The theming variables use the `--tps-nn-theme-` prefix. Notebook Navigator defines defaults on `body` for Style Settings
compatibility.

Themes can override variables on `body`, `.theme-light`, or `.theme-dark`.

On desktop, the background mode setting can map pane backgrounds:

- Separate (default): navigation uses `--tps-nn-theme-nav-bg` and list uses `--tps-nn-theme-list-bg`.
- Primary: navigation uses `--tps-nn-theme-list-bg`.
- Secondary: list uses `--tps-nn-theme-nav-bg`.

On mobile, both panes use `--tps-nn-theme-mobile-bg`.

Most variables are colors and should resolve to a computed color (some are used with `color-mix()`).
`--tps-nn-theme-nav-separator-background` is used as a `background` value.

### Theme foreground

| Variable                      | Default                                                             | Description              |
| ----------------------------- | ------------------------------------------------------------------- | ------------------------ |
| `--tps-nn-theme-foreground`       | `var(--text-normal)`                                                | Base foreground color    |
| `--tps-nn-theme-foreground-muted` | `color-mix(in srgb, var(--tps-nn-theme-foreground) 70%, transparent)`   | Muted foreground color   |
| `--tps-nn-theme-foreground-faded` | `color-mix(in srgb, var(--tps-nn-theme-foreground) 50%, transparent)`   | Faded foreground color   |
| `--tps-nn-theme-foreground-faint` | `color-mix(in srgb, var(--tps-nn-theme-foreground) 10%, transparent)`   | Faint foreground color   |

### Calendar

| Variable                                      | Default                                | Description                                     |
| --------------------------------------------- | -------------------------------------- | ----------------------------------------------- |
| `--tps-nn-theme-calendar-header-color`            | `var(--tps-nn-theme-foreground)`           | Text color for month/year and header buttons    |
| `--tps-nn-theme-calendar-weekday-color`           | `var(--tps-nn-theme-foreground-muted)`     | Text color for weekday labels (Mon, Tue, Wed...) |
| `--tps-nn-theme-calendar-week-color`              | `var(--tps-nn-theme-foreground-muted)`     | Text color for week numbers                     |
| `--tps-nn-theme-calendar-day-in-month-color`      | `var(--tps-nn-theme-foreground)`           | Text color for days within the current month    |
| `--tps-nn-theme-calendar-day-outside-month-color` | `var(--tps-nn-theme-foreground-faded)`     | Text color for days outside the current month   |
| `--tps-nn-theme-calendar-weekend-bg`              | `color-mix(in srgb, var(--tps-nn-theme-foreground) 10%, transparent)` | Background color for weekend day cells |
| `--tps-nn-theme-calendar-hover-bg`                | `var(--background-modifier-hover)`     | Hover background for calendar buttons and days  |
| `--tps-nn-theme-calendar-note-indicator-color`   | `var(--tps-nn-theme-foreground-faded)`     | Dot color for dates with a daily note           |
| `--tps-nn-theme-calendar-unfinished-task-indicator-color` | `var(--tps-nn-theme-calendar-note-indicator-color)` | Color for the hollow indicator shown on dates with unfinished tasks |
| `--tps-nn-theme-calendar-feature-image-text-color` | `white`                             | Text color for dates with feature images        |
| `--tps-nn-theme-calendar-feature-image-overlay-color` | `rgb(0 0 0 / 0.05)` in light mode, `rgb(0 0 0 / 0.3)` in dark mode | Overlay color for calendar feature images |
| `--tps-nn-theme-calendar-day-today-color`         | `var(--tps-nn-theme-calendar-day-in-month-color)` | Text color for today's date                |
| `--tps-nn-theme-calendar-day-today-bg`            | `var(--text-selection)`                | Background color for today's date highlight     |
| `--tps-nn-theme-calendar-day-active-border-color` | `var(--interactive-accent)` | Border color for active calendar outlines |
| `--tps-nn-theme-calendar-day-active-border-width` | `3px` | Border width for active calendar outlines |

### Navigation pane

| Variable                              | Default                                                                                                                                      | Description                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `--tps-nn-theme-nav-bg`                   | `var(--background-secondary)`                                                                                                                | Navigation pane background (desktop only, see mobile styles)                        |
| `--tps-nn-theme-nav-separator-color`      | `var(--tps-nn-theme-foreground)`                                                                                                                 | Separator line color inside navigation spacers                                      |
| `--tps-nn-theme-nav-separator-background` | `linear-gradient(90deg, transparent 0%, var(--tps-nn-theme-nav-separator-color) 15%, var(--tps-nn-theme-nav-separator-color) 85%, transparent 100%)` | Fill for navigation separators; override to supply your own gradient or solid color |
| `--tps-nn-theme-nav-separator-height`     | `1px`                                                                                                                                        | Thickness for navigation separators                                                 |
| `--tps-nn-theme-nav-separator-opacity`    | `0.3`                                                                                                                                        | Opacity for navigation separators                                                   |
| `--tps-nn-theme-nav-indent-guide-color`   | `var(--tps-nn-theme-foreground-faded)`                                                                                                           | Line color for navigation indent guides                                             |
| `--tps-nn-theme-nav-leader-color`         | `var(--tps-nn-theme-foreground-faded)`                                                                                                           | Color for leaders between item names and trailing values                            |

#### Pinned shortcuts

| Variable                                  | Default               | Description                                                                              |
| ----------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| `--tps-nn-theme-pinned-shortcut-shadow-color` | `rgba(0, 0, 0, 0.03)` | Gradient overlay rendered beneath pinned shortcuts (defaults to `rgba(0, 0, 0, 0.18)` in `.theme-dark`) |

#### Navigation items

| Variable                                             | Default                                          | Description                                                         |
| ---------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| `--tps-nn-theme-navitem-chevron-color`                   | `var(--tps-nn-theme-foreground-muted)`               | Color for expand/collapse arrows                                    |
| `--tps-nn-theme-navitem-icon-color`                      | `var(--tps-nn-theme-foreground-muted)`               | Icon color for folders, tags, and properties                        |
| `--tps-nn-theme-navitem-name-color`                      | `var(--tps-nn-theme-foreground)`                     | Text color for folder, tag, and property names                      |
| `--tps-nn-theme-navitem-file-name-color`                 | `var(--tps-nn-theme-navitem-name-color)`             | Text color for note shortcuts and recent files                      |
| `--tps-nn-theme-navitem-count-color`                     | `var(--tps-nn-theme-foreground-muted)`               | Text color for file count badges                                    |
| `--tps-nn-theme-navitem-count-bg`                        | `transparent`                                    | Background color for file count badges                              |
| `--tps-nn-theme-navitem-count-border-radius`             | `8px`                                            | Corner radius for file count badges (0-8px)                         |
| `--tps-nn-theme-navitem-border-radius`                   | `4px`                                            | Corner radius for navigation items (0-14px)                         |
| `--tps-nn-theme-navitem-hover-bg`                        | `var(--background-modifier-hover)`               | Item hover background color (desktop only)                          |
| `--tps-nn-theme-navitem-selected-bg`                     | `var(--text-selection)`                          | Selected item background color                                      |
| `--tps-nn-theme-navitem-selected-chevron-color`          | `var(--tps-nn-theme-navitem-chevron-color)`          | Expand/collapse arrow color when item is selected                   |
| `--tps-nn-theme-navitem-selected-icon-color`             | `var(--tps-nn-theme-navitem-icon-color)`             | Icon color when item is selected                                    |
| `--tps-nn-theme-navitem-selected-name-color`             | `var(--tps-nn-theme-navitem-name-color)`             | Navigation item name color when selected                             |
| `--tps-nn-theme-navitem-selected-count-color`            | `var(--tps-nn-theme-navitem-count-color)`            | File count text color when item is selected                         |
| `--tps-nn-theme-navitem-selected-count-bg`               | `var(--tps-nn-theme-navitem-count-bg)`               | File count background color when selected                           |
| `--tps-nn-theme-navitem-selected-inactive-bg`            | `var(--background-modifier-hover)`               | Selected item background when pane is inactive (desktop only)       |
| `--tps-nn-theme-navitem-selected-inactive-name-color`    | `var(--tps-nn-theme-navitem-name-color)`             | Navigation item name color when selected and pane is inactive       |
| `--tps-nn-theme-navitem-selected-inactive-chevron-color` | `var(--tps-nn-theme-navitem-selected-chevron-color)` | Expand/collapse arrow color when selected and pane is inactive      |
| `--tps-nn-theme-navitem-selected-inactive-icon-color`    | `var(--tps-nn-theme-navitem-selected-icon-color)`    | Icon color when selected and pane is inactive                       |
| `--tps-nn-theme-navitem-selected-inactive-count-color`   | `var(--tps-nn-theme-navitem-selected-count-color)`   | File count text color when selected and pane is inactive            |
| `--tps-nn-theme-navitem-selected-inactive-count-bg`      | `var(--tps-nn-theme-navitem-selected-count-bg)`      | File count background color when selected and pane is inactive      |
| `--tps-nn-theme-tag-positive-bg`                         | `#00800033`                                      | Background for positive tag highlights and tag drop targets         |
| `--tps-nn-theme-tag-negative-bg`                         | `#ff000033`                                      | Background for negative tag highlights and the untagged drop target |

#### Text styling

These variables control the font weight and decoration of names in the navigation pane: folders, tags, properties, section
headers, shortcuts, and recent files.
Priority order for font weight: custom color styles override the default style.
Folders with notes use the same font weights and are marked with a text decoration.

| Variable                                               | Default     | Description                                                                |
| ------------------------------------------------------ | ----------- | -------------------------------------------------------------------------- |
| `--tps-nn-theme-navitem-name-font-weight`                  | `400`       | Font weight of all names in the navigation pane (400 = regular, 600 = bold) |
| `--tps-nn-theme-navitem-custom-color-name-font-weight`     | `600`       | Font weight of names with custom or rainbow colors (overrides name weight) |
| `--tps-nn-theme-navitem-count-font-weight`                 | `400`       | Font weight for file count badges                                          |
| `--tps-nn-theme-navitem-folder-note-name-decoration`       | `underline` | Text decoration for folders with notes (none, underline, underline dotted) |
| `--tps-nn-theme-navitem-folder-note-name-hover-decoration` | `underline` | Text decoration when hovering folders with notes                           |

### Borders

Border variables apply to navigation rows, file rows, count badges, and file pills.

#### Navigation borders

| Variable                                            | Default                                         | Description                                                      |
| --------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| `--tps-nn-theme-navitem-border-width`                   | `0px`                                           | Border width for navigation custom backgrounds, hover, and selection |
| `--tps-nn-theme-navitem-custom-border-color`            | `transparent`                                   | Border color for rows with custom backgrounds                    |
| `--tps-nn-theme-navitem-hover-border-color`             | `transparent`                                   | Border color for hovered navigation rows                         |
| `--tps-nn-theme-navitem-selected-border-color`          | `transparent`                                   | Border color for selected navigation rows                        |
| `--tps-nn-theme-navitem-selected-inactive-border-color` | `var(--tps-nn-theme-navitem-selected-border-color)` | Border color for selected navigation rows when pane is inactive  |
| `--tps-nn-theme-navitem-count-border-width`             | `0px`                                           | Border width for navigation file count badges                    |
| `--tps-nn-theme-navitem-count-border-color`             | `transparent`                                   | Border color for navigation file count badges                    |
| `--tps-nn-theme-navitem-selected-count-border-color`    | `var(--tps-nn-theme-navitem-count-border-color)`    | Border color for selected navigation file count badges           |
| `--tps-nn-theme-navitem-selected-inactive-count-border-color` | `var(--tps-nn-theme-navitem-selected-count-border-color)` | Border color for selected navigation file count badges when pane is inactive |

#### File item borders

| Variable                                     | Default                                      | Description                                                |
| -------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| `--tps-nn-theme-file-border-width`               | `0px`                                        | Border width for selected file rows                        |
| `--tps-nn-theme-file-selected-border-color`      | `transparent`                                | Border color for selected file rows                        |
| `--tps-nn-theme-file-selected-inactive-border-color` | `var(--tps-nn-theme-file-selected-border-color)` | Border color for selected file rows when pane is inactive  |

#### Pill borders

| Variable                                     | Default                                                             | Description                                       |
| -------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------- |
| `--tps-nn-theme-file-pill-border-width`          | `1px`                                                               | Border width for tag and property pills           |
| `--tps-nn-theme-file-tag-border-color`           | `color-mix(in srgb, var(--tps-nn-theme-foreground) 30%, transparent)`   | Border color for tag pills                        |
| `--tps-nn-theme-file-property-border-color`      | `var(--tps-nn-theme-file-tag-border-color)`                             | Border color for property pills                   |
| `--tps-nn-theme-file-selected-tag-border-color`  | `var(--tps-nn-theme-file-tag-border-color)`                             | Border color for tag pills in selected file rows  |
| `--tps-nn-theme-file-selected-property-border-color` | `var(--tps-nn-theme-file-property-border-color)`                     | Border color for property pills in selected file rows |

### Pane divider (desktop and tablet dual pane)

| Variable                                    | Default                             | Description                                               |
| ------------------------------------------- | ----------------------------------- | --------------------------------------------------------- |
| `--tps-nn-theme-divider-border-color`           | `var(--divider-color)`              | Color of the vertical border between panes                |
| `--tps-nn-theme-divider-resize-handle-hover-bg` | `var(--interactive-accent)`         | Background color when hovering the pane divider to resize |

### List pane (files)

| Variable                                  | Default                             | Description                                                                        |
| ----------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| `--tps-nn-theme-list-bg`                      | `var(--background-primary)`         | Background color of the list pane (desktop only, see mobile styles)                |
| `--tps-nn-theme-list-header-icon-color`       | `var(--tps-nn-theme-foreground-muted)`  | Folder/tag/property icon color shown beside the breadcrumb in the desktop header   |
| `--tps-nn-theme-list-header-breadcrumb-color` | `var(--tps-nn-theme-foreground-muted)`  | Text color for the breadcrumb path in the desktop header                           |
| `--tps-nn-theme-list-search-active-bg`        | `var(--text-highlight-bg)`          | Background color for the search field and match highlights when a search query is active |
| `--tps-nn-theme-list-search-border-color`     | `var(--background-modifier-border)` | Border and focus ring color for the search field                                   |
| `--tps-nn-theme-list-heading-color`           | `var(--tps-nn-theme-foreground-muted)`  | Text color for the list pane title area and vault title                            |
| `--tps-nn-theme-list-group-header-color`      | `var(--tps-nn-theme-foreground-muted)`  | Text color for date groups and pinned section                                      |
| `--tps-nn-theme-list-separator-color`         | `var(--background-modifier-border)` | Divider line color between files                                                   |

#### File items

| Variable                                          | Default                                       | Description                                                     |
| ------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| `--tps-nn-theme-file-name-color`                      | `var(--tps-nn-theme-foreground)`                  | Text color for file names                                       |
| `--tps-nn-theme-file-preview-color`                   | `var(--tps-nn-theme-foreground-muted)`            | Text color for content preview                                  |
| `--tps-nn-theme-file-task-icon-color`                 | `var(--tps-nn-theme-navitem-icon-color)`          | Icon color for notes with unfinished tasks                      |
| `--tps-nn-theme-file-feature-border-radius`           | `4px`                                         | Corner radius for feature images (0-32px)                       |
| `--tps-nn-theme-file-date-color`                      | `var(--tps-nn-theme-foreground-faded)`            | Text color for creation or modification dates                   |
| `--tps-nn-theme-file-word-count-color`                | `var(--tps-nn-theme-foreground-faded)`            | Text color for word count suffixes                             |
| `--tps-nn-theme-file-parent-color`                    | `var(--tps-nn-theme-foreground-faded)`            | Text color for parent folder path (when showing subfolders)     |
| `--tps-nn-theme-file-tag-color`                       | `var(--tps-nn-theme-foreground-faded)`            | Text color for tag pills without custom colors                  |
| `--tps-nn-theme-file-tag-custom-color-text-color`     | `var(--tps-nn-theme-navitem-name-color)`          | Text color for tags with custom backgrounds but no custom color |
| `--tps-nn-theme-file-tag-bg`                          | `transparent`                                 | Background color for tag pills without custom backgrounds       |
| `--tps-nn-theme-file-property-color`                  | `var(--tps-nn-theme-foreground-faded)`            | Text color for property pills                                   |
| `--tps-nn-theme-file-property-bg`                     | `transparent`                                 | Background color for property pills                              |
| `--tps-nn-theme-file-tag-border-radius`               | `10px`                                        | Corner radius for tag pills (0-10px)                            |
| `--tps-nn-theme-file-property-border-radius`          | `10px`                                        | Corner radius for property pills (0-10px)                       |
| `--tps-nn-theme-file-border-radius`                   | `8px`                                         | Corner radius for file items (0-16px)                           |
| `--tps-nn-theme-file-selected-bg`                     | `var(--text-selection)`                       | Selected file background color                                  |
| `--tps-nn-theme-file-selected-name-color`             | `var(--tps-nn-theme-file-name-color)`             | Text color for file names when selected                         |
| `--tps-nn-theme-file-selected-preview-color`          | `var(--tps-nn-theme-file-preview-color)`          | Text color for content preview when selected                    |
| `--tps-nn-theme-file-selected-date-color`             | `var(--tps-nn-theme-foreground-muted)`            | Text color for file dates when selected                         |
| `--tps-nn-theme-file-selected-word-count-color`       | `var(--tps-nn-theme-foreground-muted)`            | Text color for word count suffixes when selected                |
| `--tps-nn-theme-file-selected-parent-color`           | `var(--tps-nn-theme-foreground-muted)`            | Text color for parent folder path when selected                 |
| `--tps-nn-theme-file-selected-tag-color`              | `var(--tps-nn-theme-foreground-muted)`            | Text color for tag pills when selected                          |
| `--tps-nn-theme-file-selected-tag-bg`                 | `var(--tps-nn-theme-file-tag-bg)`                 | Background color for tag pills when selected                    |
| `--tps-nn-theme-file-selected-property-color`         | `var(--tps-nn-theme-foreground-muted)`            | Text color for property pills when selected                     |
| `--tps-nn-theme-file-selected-property-bg`            | `var(--tps-nn-theme-file-property-bg)`            | Background color for property pills when selected               |
| `--tps-nn-theme-file-selected-inactive-bg`            | `var(--background-modifier-hover)`            | Selected file background when pane is inactive (desktop only)   |
| `--tps-nn-theme-file-selected-inactive-name-color`    | `var(--tps-nn-theme-file-selected-name-color)`    | File name color when selected and pane is inactive              |
| `--tps-nn-theme-file-selected-inactive-preview-color` | `var(--tps-nn-theme-file-selected-preview-color)` | Content preview color when selected and pane is inactive        |
| `--tps-nn-theme-file-selected-inactive-date-color`    | `var(--tps-nn-theme-file-selected-date-color)`    | File date color when selected and pane is inactive              |
| `--tps-nn-theme-file-selected-inactive-word-count-color` | `var(--tps-nn-theme-file-selected-word-count-color)` | Word count suffix color when selected and pane is inactive      |
| `--tps-nn-theme-file-selected-inactive-parent-color`  | `var(--tps-nn-theme-file-selected-parent-color)`  | Parent folder color when selected and pane is inactive          |
| `--tps-nn-theme-file-selected-inactive-tag-color`     | `var(--tps-nn-theme-file-selected-tag-color)`     | Tag text color when selected and pane is inactive               |
| `--tps-nn-theme-file-selected-inactive-tag-bg`        | `var(--tps-nn-theme-file-tag-bg)`                 | Tag background color when selected and pane is inactive         |
| `--tps-nn-theme-file-selected-inactive-property-color` | `var(--tps-nn-theme-file-selected-property-color)` | Property pill text color when selected and pane is inactive     |
| `--tps-nn-theme-file-selected-inactive-property-bg`    | `var(--tps-nn-theme-file-property-bg)`            | Property pill background color when selected and pane is inactive |

Tag pills that only set a custom text color use the list pane background. Tag pills that set a custom background use the
navigation pane background. In `primary` and `secondary` background modes, both panes share the same background.

#### Text styling

| Variable                                        | Default | Description                                          |
| ----------------------------------------------- | ------- | ---------------------------------------------------- |
| `--tps-nn-theme-list-header-breadcrumb-font-weight` | `600`   | Font weight for the breadcrumb in the desktop header |
| `--tps-nn-theme-list-heading-font-weight`           | `600`   | Font weight for the list pane title area and vault title |
| `--tps-nn-theme-list-group-header-font-weight`      | `600`   | Font weight for date groups and pinned section       |
| `--tps-nn-theme-file-name-font-weight`              | `600`   | Font weight for file names                           |
| `--tps-nn-theme-file-compact-name-font-weight`      | `400`   | Font weight for file names in compact mode           |
| `--tps-nn-theme-file-preview-font-weight`           | `400`   | Font weight for file preview text                    |
| `--tps-nn-theme-file-date-font-weight`              | `400`   | Font weight for file dates                           |
| `--tps-nn-theme-file-word-count-font-weight`        | `400`   | Font weight for word count suffixes                  |
| `--tps-nn-theme-file-parent-font-weight`            | `400`   | Font weight for parent folder path                   |
| `--tps-nn-theme-file-tag-font-weight`               | `400`   | Font weight for tag and property pills               |

#### Quick actions (desktop only)

| Variable                                    | Default                                                          | Description                                                       |
| ------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `--tps-nn-theme-quick-actions-bg`               | `color-mix(in srgb, var(--background-primary) 95%, transparent)` | Background color of quick actions toolbar (supports transparency) |
| `--tps-nn-theme-quick-actions-border`           | `var(--background-modifier-border)`                              | Border color of quick actions toolbar                             |
| `--tps-nn-theme-quick-actions-border-radius`    | `4px`                                                            | Corner radius for quick actions panel (0-12px)                    |
| `--tps-nn-theme-quick-actions-icon-color`       | `var(--tps-nn-theme-foreground-muted)`                               | Icon color for quick action buttons                               |
| `--tps-nn-theme-quick-actions-icon-hover-color` | `var(--tps-nn-theme-foreground)`                                     | Icon color when hovering quick action buttons                     |
| `--tps-nn-theme-quick-actions-separator-color`  | `var(--background-modifier-border)`                              | Divider color between quick action buttons                        |

### Headers (desktop only)

| Variable                                       | Default                            | Description                                        |
| ---------------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| `--tps-nn-theme-header-button-icon-color`          | `var(--icon-color)`                | Default icon color for header buttons              |
| `--tps-nn-theme-header-button-hover-bg`            | `var(--background-modifier-hover)` | Background color when hovering header buttons      |
| `--tps-nn-theme-header-button-active-bg`           | `var(--background-modifier-hover)` | Background color for active/toggled header buttons |
| `--tps-nn-theme-header-button-active-icon-color`   | `var(--text-normal)`               | Icon color for active/toggled header buttons       |
| `--tps-nn-theme-header-button-disabled-icon-color` | `var(--icon-color)`                | Icon color for disabled header buttons             |

### Mobile styles

| Variable                                               | Default                                                          | Description                                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `--tps-nn-theme-mobile-bg`                                 | `var(--mobile-sidebar-background)`                               | Navigation and list pane background on mobile                                                                    |
| `--tps-nn-theme-mobile-list-header-link-color`             | `var(--link-color)`                                              | Color for back button and clickable breadcrumb segments on mobile                                                |
| `--tps-nn-theme-mobile-list-header-breadcrumb-color`       | `var(--tps-nn-theme-foreground)`                                     | Color for current folder and separators in breadcrumb on mobile                                                  |
| `--tps-nn-theme-mobile-list-header-breadcrumb-font-weight` | `600`                                                            | Font weight for mobile breadcrumb                                                                                |
| `--tps-nn-theme-mobile-toolbar-button-icon-color`          | `var(--link-color)`                                              | Icon color for toolbar buttons                                                                                   |
| `--tps-nn-theme-mobile-toolbar-button-active-bg`           | `var(--background-modifier-hover)`                               | Background color for active toolbar button                                                                       |
| `--tps-nn-theme-mobile-toolbar-button-active-icon-color`   | `var(--link-color)`                                              | Icon color for active toolbar button                                                                             |
| `--tps-nn-theme-mobile-toolbar-glass-bg`                   | `var(--background-primary)`                                      | Base color of the iOS glass toolbar (mixed with transparency)                                                    |

Mobile navigation and list pane backgrounds follow `--tps-nn-theme-mobile-bg`.

On iOS with floating toolbars enabled, `.tps-notebook-navigator-ios.tps-notebook-navigator-ios-floating-toolbars` overrides:

- `--tps-nn-theme-mobile-toolbar-button-icon-color`: `var(--tps-nn-theme-foreground)`
- `--tps-nn-theme-mobile-toolbar-button-active-bg`: `transparent`

## Complete Theme Example

Example theme snippet using a JetBrains Darcula-inspired palette. It sets all `--tps-nn-theme-*` variables defined in CSS:

```css
body {
  /* Theme foreground */
  --tps-nn-theme-foreground: #a9b7c6;
  --tps-nn-theme-foreground-muted: #7f8b91;
  --tps-nn-theme-foreground-faded: #6e6e6e;
  --tps-nn-theme-foreground-faint: #4f565a;

  /* Navigation pane */
  --tps-nn-theme-nav-bg: #3c3f41;
  --tps-nn-theme-nav-separator-color: #6e6e6e;
  --tps-nn-theme-nav-separator-background: var(--tps-nn-theme-nav-separator-color);
  --tps-nn-theme-nav-separator-height: 1px;
  --tps-nn-theme-nav-separator-opacity: 0.35;
  --tps-nn-theme-nav-indent-guide-color: rgba(127, 139, 145, 0.65);
  --tps-nn-theme-nav-leader-color: rgba(127, 139, 145, 0.65);

  /* Navigation calendar */
  --tps-nn-theme-calendar-header-color: var(--tps-nn-theme-foreground);
  --tps-nn-theme-calendar-weekday-color: var(--tps-nn-theme-foreground-muted);
  --tps-nn-theme-calendar-week-color: var(--tps-nn-theme-foreground-muted);
  --tps-nn-theme-calendar-day-in-month-color: var(--tps-nn-theme-foreground);
  --tps-nn-theme-calendar-day-outside-month-color: var(--tps-nn-theme-foreground-faded);
  --tps-nn-theme-calendar-weekend-bg: rgba(169, 183, 198, 0.1);
  --tps-nn-theme-calendar-hover-bg: #4b5059;
  --tps-nn-theme-calendar-note-indicator-color: #4a78c8;
  --tps-nn-theme-calendar-unfinished-task-indicator-color: #4a78c8;
  --tps-nn-theme-calendar-feature-image-text-color: #ffffff;
  --tps-nn-theme-calendar-feature-image-overlay-color: rgb(0 0 0 / 0.05);
  --tps-nn-theme-calendar-day-today-color: #ffffff;
  --tps-nn-theme-calendar-day-today-bg: #4a78c8;
  --tps-nn-theme-calendar-day-active-border-color: rgba(169, 183, 198, 0.5);
  --tps-nn-theme-calendar-day-active-border-width: 2px;

  /* Navigation items */
  --tps-nn-theme-navitem-chevron-color: #6e6e6e;
  --tps-nn-theme-navitem-icon-color: #afb1b3;
  --tps-nn-theme-navitem-name-color: #a9b7c6;
  --tps-nn-theme-navitem-file-name-color: #a9b7c6;
  --tps-nn-theme-navitem-count-color: #7f8b91;
  --tps-nn-theme-navitem-count-bg: transparent;
  --tps-nn-theme-navitem-count-border-radius: 3px;
  --tps-nn-theme-navitem-border-radius: 3px;
  --tps-nn-theme-navitem-hover-bg: #4b5059;
  --tps-nn-theme-navitem-selected-bg: #4a78c8;
  --tps-nn-theme-navitem-selected-chevron-color: #c5c5c5;
  --tps-nn-theme-navitem-selected-icon-color: #e6e6e6;
  --tps-nn-theme-navitem-selected-name-color: #ffffff;
  --tps-nn-theme-navitem-selected-count-color: #e6e6e6;
  --tps-nn-theme-navitem-selected-count-bg: rgba(0, 0, 0, 0.2);
  --tps-nn-theme-navitem-selected-inactive-bg: #464c55;
  --tps-nn-theme-navitem-selected-inactive-name-color: #cfd3da;
  --tps-nn-theme-navitem-selected-inactive-chevron-color: #9da2ab;
  --tps-nn-theme-navitem-selected-inactive-icon-color: #b9bec6;
  --tps-nn-theme-navitem-selected-inactive-count-color: #b9bec6;
  --tps-nn-theme-navitem-selected-inactive-count-bg: rgba(0, 0, 0, 0.25);
  --tps-nn-theme-navitem-border-width: 1px;
  --tps-nn-theme-navitem-count-border-width: 1px;
  --tps-nn-theme-navitem-custom-border-color: rgba(0, 0, 0, 0.18);
  --tps-nn-theme-navitem-hover-border-color: rgba(255, 255, 255, 0.18);
  --tps-nn-theme-navitem-selected-border-color: rgba(255, 255, 255, 0.25);
  --tps-nn-theme-navitem-selected-inactive-border-color: rgba(255, 255, 255, 0.14);
  --tps-nn-theme-navitem-count-border-color: rgba(255, 255, 255, 0.2);
  --tps-nn-theme-navitem-selected-count-border-color: rgba(255, 255, 255, 0.3);
  --tps-nn-theme-navitem-selected-inactive-count-border-color: rgba(255, 255, 255, 0.2);

  /* Tag highlights and drop targets */
  --tps-nn-theme-tag-positive-bg: rgba(106, 135, 89, 0.2);
  --tps-nn-theme-tag-negative-bg: rgba(219, 80, 80, 0.2);

  /* Pinned shortcuts */
  --tps-nn-theme-pinned-shortcut-shadow-color: rgba(0, 0, 0, 0.2);

  /* Navigation text styling */
  --tps-nn-theme-navitem-name-font-weight: 400;
  --tps-nn-theme-navitem-custom-color-name-font-weight: 600;
  --tps-nn-theme-navitem-folder-note-name-decoration: underline;
  --tps-nn-theme-navitem-folder-note-name-hover-decoration: underline;
  --tps-nn-theme-navitem-count-font-weight: 400;

  /* Pane divider */
  --tps-nn-theme-divider-border-color: #323232;
  --tps-nn-theme-divider-resize-handle-hover-bg: #4a78c8;

  /* List pane */
  --tps-nn-theme-list-bg: #2b2b2b;
  --tps-nn-theme-list-header-icon-color: #7f8b91;
  --tps-nn-theme-list-header-breadcrumb-color: #7f8b91;
  --tps-nn-theme-list-header-breadcrumb-font-weight: 600;
  --tps-nn-theme-list-search-active-bg: #515336;
  --tps-nn-theme-list-search-border-color: #3c3c3c;
  --tps-nn-theme-list-heading-color: #d0d2d6;
  --tps-nn-theme-list-group-header-color: #7f8b91;
  --tps-nn-theme-list-separator-color: #3c3c3c;

  /* File items */
  --tps-nn-theme-file-name-color: #a9b7c6;
  --tps-nn-theme-file-preview-color: #7f8b91;
  --tps-nn-theme-file-task-icon-color: #afb1b3;
  --tps-nn-theme-file-feature-border-radius: 3px;
  --tps-nn-theme-file-date-color: #6a8759;
  --tps-nn-theme-file-word-count-color: #6a8759;
  --tps-nn-theme-file-parent-color: #cc7832;
  --tps-nn-theme-file-tag-color: #9876aa;
  --tps-nn-theme-file-tag-custom-color-text-color: #ffffff;
  --tps-nn-theme-file-tag-bg: #383a3e;
  --tps-nn-theme-file-property-color: #cc7832;
  --tps-nn-theme-file-property-bg: #383a3e;
  --tps-nn-theme-file-tag-border-radius: 3px;
  --tps-nn-theme-file-property-border-radius: 3px;
  --tps-nn-theme-file-border-radius: 4px;
  --tps-nn-theme-file-selected-bg: #4a78c8;
  --tps-nn-theme-file-selected-name-color: #ffffff;
  --tps-nn-theme-file-selected-preview-color: #c5c5c5;
  --tps-nn-theme-file-selected-date-color: #a5dc86;
  --tps-nn-theme-file-selected-word-count-color: #a5dc86;
  --tps-nn-theme-file-selected-parent-color: #ffd580;
  --tps-nn-theme-file-selected-tag-color: #ffffff;
  --tps-nn-theme-file-selected-tag-bg: #5a5f66;
  --tps-nn-theme-file-selected-property-color: #ffffff;
  --tps-nn-theme-file-selected-property-bg: #5a5f66;
  --tps-nn-theme-file-selected-inactive-bg: #383c45;
  --tps-nn-theme-file-selected-inactive-name-color: #dfe3e8;
  --tps-nn-theme-file-selected-inactive-preview-color: #b9bec6;
  --tps-nn-theme-file-selected-inactive-date-color: #8fb275;
  --tps-nn-theme-file-selected-inactive-word-count-color: #8fb275;
  --tps-nn-theme-file-selected-inactive-parent-color: #e3b173;
  --tps-nn-theme-file-selected-inactive-tag-color: #dfe3e8;
  --tps-nn-theme-file-selected-inactive-tag-bg: #4c5058;
  --tps-nn-theme-file-selected-inactive-property-color: #dfe3e8;
  --tps-nn-theme-file-selected-inactive-property-bg: #4c5058;
  --tps-nn-theme-file-border-width: 1px;
  --tps-nn-theme-file-pill-border-width: 1px;
  --tps-nn-theme-file-selected-border-color: rgba(255, 255, 255, 0.24);
  --tps-nn-theme-file-selected-inactive-border-color: rgba(255, 255, 255, 0.14);
  --tps-nn-theme-file-tag-border-color: rgba(255, 255, 255, 0.2);
  --tps-nn-theme-file-property-border-color: rgba(255, 255, 255, 0.2);
  --tps-nn-theme-file-selected-tag-border-color: rgba(255, 255, 255, 0.3);
  --tps-nn-theme-file-selected-property-border-color: rgba(255, 255, 255, 0.3);

  /* File text styling */
  --tps-nn-theme-list-heading-font-weight: 600;
  --tps-nn-theme-list-group-header-font-weight: 600;
  --tps-nn-theme-file-name-font-weight: 600;
  --tps-nn-theme-file-compact-name-font-weight: 400;
  --tps-nn-theme-file-preview-font-weight: 400;
  --tps-nn-theme-file-date-font-weight: 400;
  --tps-nn-theme-file-word-count-font-weight: 400;
  --tps-nn-theme-file-parent-font-weight: 400;
  --tps-nn-theme-file-tag-font-weight: 400;

  /* Quick actions */
  --tps-nn-theme-quick-actions-bg: rgba(43, 43, 43, 0.95);
  --tps-nn-theme-quick-actions-border: #555555;
  --tps-nn-theme-quick-actions-border-radius: 4px;
  --tps-nn-theme-quick-actions-icon-color: #7f8b91;
  --tps-nn-theme-quick-actions-icon-hover-color: #a9b7c6;
  --tps-nn-theme-quick-actions-separator-color: #3c3c3c;

  /* Headers */
  --tps-nn-theme-header-button-icon-color: #7f8b91;
  --tps-nn-theme-header-button-hover-bg: #4b5059;
  --tps-nn-theme-header-button-active-bg: #4a78c8;
  --tps-nn-theme-header-button-active-icon-color: #ffffff;
  --tps-nn-theme-header-button-disabled-icon-color: #5c5c5c;

  /* Mobile */
  --tps-nn-theme-mobile-bg: #2b2b2b;
  --tps-nn-theme-mobile-list-header-link-color: #589df6;
  --tps-nn-theme-mobile-list-header-breadcrumb-color: #a9b7c6;
  --tps-nn-theme-mobile-list-header-breadcrumb-font-weight: 600;
  --tps-nn-theme-mobile-toolbar-button-icon-color: #a9b7c6;
  --tps-nn-theme-mobile-toolbar-button-active-bg: #4a78c8;
  --tps-nn-theme-mobile-toolbar-button-active-icon-color: #ffffff;
  --tps-nn-theme-mobile-toolbar-glass-bg: #2b2b2b;
}
```

## Advanced Techniques

### Supporting Light and Dark Modes

To support both light and dark modes, define your variables under `.theme-light` and `.theme-dark` classes:

#### Example: Mode-Aware Theme

```css
/* Light mode - pastel colors */
.theme-light {
  /* Navigation pane */
  --tps-nn-theme-nav-bg: #ffeeff; /* Light pink */
  --tps-nn-theme-calendar-feature-image-overlay-color: rgb(0 0 0 / 0.05);
  --tps-nn-theme-nav-separator-color: #ff99cc; /* Pink separator lines */
  --tps-nn-theme-navitem-name-color: #ff66cc; /* Pink text */
  --tps-nn-theme-navitem-hover-bg: #ffddff; /* Very light pink */
  --tps-nn-theme-navitem-selected-bg: #ffccff; /* Pastel purple */
  --tps-nn-theme-navitem-selected-chevron-color: #990099; /* Deep purple chevron when selected */
  --tps-nn-theme-navitem-selected-icon-color: #990099; /* Deep purple icon when selected */
  --tps-nn-theme-navitem-selected-name-color: #990099; /* Deep purple text when selected */
  --tps-nn-theme-navitem-selected-count-color: #ffffff; /* White count text when selected */
  --tps-nn-theme-navitem-selected-count-bg: #ff66cc; /* Pink count background when selected */

  /* File list */
  --tps-nn-theme-list-bg: #fff0ff; /* Very light purple */
  --tps-nn-theme-file-name-color: #cc33ff; /* Purple text */
  --tps-nn-theme-file-selected-bg: #ffccff; /* Pastel purple */
  --tps-nn-theme-file-preview-color: #ff99cc; /* Light pink */
  --tps-nn-theme-file-tag-custom-color-text-color: #000000; /* Black text for custom tags in light mode */
}

/* Dark mode - pastel colors on dark */
.theme-dark {
  /* Navigation pane */
  --tps-nn-theme-nav-bg: #330033; /* Dark purple */
  --tps-nn-theme-calendar-feature-image-overlay-color: rgb(0 0 0 / 0.3);
  --tps-nn-theme-nav-separator-color: #ff66ff; /* Bright separator lines */
  --tps-nn-theme-navitem-name-color: #ffaaff; /* Light pink text */
  --tps-nn-theme-navitem-hover-bg: #442244; /* Dark purple hover */
  --tps-nn-theme-navitem-selected-bg: #663366; /* Muted purple */
  --tps-nn-theme-navitem-selected-chevron-color: #ffccff; /* Light purple chevron when selected */
  --tps-nn-theme-navitem-selected-icon-color: #ffccff; /* Light purple icon when selected */
  --tps-nn-theme-navitem-selected-name-color: #ffccff; /* Light purple text when selected */
  --tps-nn-theme-navitem-selected-count-color: #330033; /* Dark purple count text when selected */
  --tps-nn-theme-navitem-selected-count-bg: #ffaaff; /* Light pink count background when selected */

  /* File list */
  --tps-nn-theme-list-bg: #2a002a; /* Very dark purple */
  --tps-nn-theme-file-name-color: #ff99ff; /* Light purple text */
  --tps-nn-theme-file-selected-bg: #663366; /* Muted purple */
  --tps-nn-theme-file-preview-color: #cc99cc; /* Muted pink */
  --tps-nn-theme-file-tag-custom-color-text-color: #ffffff; /* White text for custom tags in dark mode */
}
```

### User Custom Colors Override

When users set custom colors or backgrounds (right-click → "Change icon", "Change color", or "Change background"),
their choices automatically override your theme through inline styles and row-level CSS custom properties.

## Style Settings Support

Notebook Navigator includes a Style Settings `@settings` block for most theming variables.
Settings are grouped by pane and element; border settings appear next to the elements they style.

Not currently exposed in the Style Settings UI:

- `--tps-nn-theme-nav-separator-background`
- `--tps-nn-theme-nav-separator-height`
- `--tps-nn-theme-nav-separator-opacity`
