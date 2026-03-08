# Typed Notes for Obsidian — Implementation Plan

## 1. Executive Summary

**Typed Notes** (working title — see [OQ-1](#oq-1)) adds a **type system** to Obsidian notes. A "type" is a named schema (e.g., `book`, `recipe`, `job-vacancy`) that declares the properties a note should have, their data types, defaults, validation, and display hints. Notes bind to a type via a single frontmatter field (`type: book`). The plugin then enforces, auto-populates, bulk-updates, and visually distinguishes notes by type.

### Why it exists

Obsidian has **templates** but no **schemas**. Once a note is created from a template, the binding is gone — updating the template doesn't touch existing notes. Users who treat Obsidian as a structured knowledge base (reading lists, CRMs, job trackers) hit this wall immediately. They need:

- A way to define "a Book has these 7 fields" in one place
- Automatic propagation when that definition changes
- Lightweight "data-only" records that don't clutter the vault
- Database-like views — already solved by Bases

### How it differs from prior attempts

| Concern | DB Folder | DataLoom | Typed Notes |
|---|---|---|---|
| Data storage | Real `.md` files | Custom `.loom` JSON | Real `.md` files |
| YAML handling | Aggressive full-block rewrite | N/A (no YAML) | Surgical per-field edits via `processFrontMatter()` |
| Obsidian integration | Broke file explorer, depended on Dataview | Invisible to search/graph/backlinks | Native — every note is a real `.md` |
| View engine | Custom (fragile across themes) | Custom (duplicated editor) | Obsidian Bases (core plugin) |
| Mobile support | Broken by custom UI | Broken by custom format | Native UI primitives = works everywhere |
| Maintenance burden | Two-plugin coupling (Dataview) | Parallel data universe | Thin layer on top of Bases + frontmatter |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Plugin Core                          │
│  main.ts — Plugin lifecycle, command registration, events   │
├──────────┬──────────┬───────────┬──────────┬────────────────┤
│ Schema   │Frontmatter│  Note    │   UI     │  Bases         │
│ Engine   │ Manager   │ Manager  │  Layer   │  Integration   │
├──────────┼──────────┼───────────┼──────────┼────────────────┤
│- Load/   │- Surgical │- Create  │- Schema  │- Auto-generate │
│  save    │  edits    │  notes   │  editor  │  .base files   │
│  schemas │- Bulk     │- Ghost   │- Type    │- Custom view   │
│- Validate│  updates  │  files   │  picker  │  types (later) │
│- Diff    │- Type     │- Promote │- Icons   │- Embed filters │
│  changes │  coercion │  ghosts  │- Modals  │                │
└──────────┴──────────┴───────────┴──────────┴────────────────┘
         │                │               │
         ▼                ▼               ▼
   Schema Storage    Obsidian Vault    Obsidian API
   (see OQ-2)        (.md files)      (MetadataCache,
                                       FileManager,
                                       Workspace)
```

### Component Responsibilities

**Schema Engine** — Loads type definitions from storage, validates them, computes diffs when a schema changes ("field `rating` was added", "field `status` was renamed to `progress`"), and produces a changeset for the Frontmatter Manager.

**Frontmatter Manager** — The only component that touches file content. Wraps `app.fileManager.processFrontMatter()` for single-file edits and provides a batch executor for bulk updates with progress reporting and error collection.

**Note Manager** — Handles note creation (full notes and ghost files), type assignment, and the index of which notes belong to which type (backed by MetadataCache queries).

**UI Layer** — All user-facing surfaces: schema editor, type picker modal, settings tab, file explorer decorations. Built entirely on Obsidian's native `Modal`, `Setting`, `Menu`, `setIcon`, and `ItemView` primitives.

**Bases Integration** — Generates and maintains `.base` configuration files for each type, and (in later phases) registers custom Bases view types via `this.registerBasesView()`.

---

## 3. Data Model

### 3.1 Type Schema Definition

A type schema is a structured definition. The canonical in-memory representation:

```typescript
interface TypeSchema {
  /** Unique identifier, used in frontmatter `type: <id>` */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Lucide icon name or custom icon ID — see OQ-7 */
  icon?: string;
  /** Folder for ghost files created under this type — see OQ-3 */
  folder?: string;
  /** Ordered list of property definitions */
  properties: PropertyDefinition[];
}

interface PropertyDefinition {
  /** Property key as it appears in YAML frontmatter */
  key: string;
  /** Display name shown in UI and Bases column headers */
  displayName?: string;
  /** Data type — see OQ-11 for full list */
  type: PropertyType;
  /** Default value (used when creating new notes or backfilling) */
  default?: unknown;
  /** Whether the property is required (shown in validation) */
  required?: boolean;
  /** For 'select' / 'multiselect' types — see OQ-5 */
  options?: SelectOption[];
  /** For relation types — target type ID — see OQ-8 */
  relationType?: string;
  /** Column width hint for Bases table views */
  columnWidth?: number;
  /** Whether to hide this column from the default Bases view */
  hidden?: boolean;
}

type PropertyType =
  | 'text'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multiselect'
  | 'tags'      // Obsidian-native tags property
  | 'url'
  | 'aliases'   // Obsidian-native aliases property
  | 'relation'  // [[wiki-link]] to another typed note — see OQ-8
  | 'list';     // plain YAML list

interface SelectOption {
  value: string;
  color?: string;  // see OQ-5
  order?: number;
}
```

> **Storage format and location are [OQ-2](#oq-2).** The schema could be persisted as `.yaml` files, special `.md` files, or within plugin data. The in-memory model above is format-agnostic.

### 3.2 Note–Type Binding

A note is bound to a type by a single frontmatter property:

```yaml
---
type: book
title: "Designing Data-Intensive Applications"
author: "Martin Kleppmann"
rating: 5
status: read
---
```

The `type` field is the **only** contract. The plugin discovers typed notes by querying MetadataCache for all files whose frontmatter `type` matches a known schema ID.

```typescript
// Finding all notes of a given type
function getNotesOfType(app: App, typeId: string): TFile[] {
  return app.vault.getMarkdownFiles().filter(file => {
    const cache = app.metadataCache.getFileCache(file);
    return cache?.frontmatter?.type === typeId;
  });
}
```

### 3.3 Ghost Files

Ghost files are minimal `.md` files containing only frontmatter (no body content). They are real Obsidian files — indexed, linkable, searchable — but represent "data-only" records.

```markdown
---
type: book
title: "Clean Code"
author: "Robert C. Martin"
rating: 4
status: to-read
---
```

That's the entire file. No body. The plugin creates these in a configurable folder (see [OQ-3](#oq-3)).

**Detection heuristic:** A note is a "ghost" if its body content (everything after the closing `---`) is empty or whitespace-only. This is not stored in the schema — it's a runtime check used purely for visual distinction (dimmed icon, badge, etc.).

**Promotion:** When a user starts writing prose below the frontmatter, the note silently transitions from "ghost" to "full note." No explicit action required — the body is no longer empty, so the visual indicators update automatically.

### 3.4 .base File Generation

For each type, the plugin can generate a corresponding `.base` file that provides a default table view of all notes of that type. Example for `book`:

```yaml
# Auto-generated by Typed Notes. Manual edits are preserved on regeneration.
filters:
  and:
    - 'type = "book"'
    - file.inFolder("_data/books")  # if ghost folder is configured

properties:
  title:
    displayName: Title
  author:
    displayName: Author
  rating:
    displayName: Rating
  status:
    displayName: Status

views:
  - type: table
    name: "All Books"
    order:
      - file.name
      - note.title
      - note.author
      - note.rating
      - note.status
```

> **Depth of Bases integration is [OQ-9](#oq-9).**

---

## 4. Core Features

### Phase 1 — MVP

| # | Feature | Description |
|---|---------|-------------|
| 1.1 | **Schema definition** | Define types with properties, types, defaults. Persistent storage. |
| 1.2 | **Schema editor UI** | Visual interface for creating/editing type schemas — see [OQ-4](#oq-4) |
| 1.3 | **Note creation** | Create a new note of a given type (command palette + modal). Auto-populates frontmatter from schema. |
| 1.4 | **Ghost file creation** | Create data-only records in designated folders. |
| 1.5 | **Type detection** | Index existing notes by scanning frontmatter `type` field. React to MetadataCache changes. |
| 1.6 | **Schema evolution — add/remove fields** | Add a new property → backfill across all notes of that type. Remove a property → optionally strip from notes. |
| 1.7 | **Schema evolution — rename fields** | Rename a property key across all notes of that type. |
| 1.8 | **Bulk update preview + confirmation** | Before any schema change touches files, show a preview: "This will modify N notes. Fields affected: ..." User confirms or cancels. |
| 1.9 | **Settings tab** | Plugin settings: default ghost folder, type list overview, global preferences. |

### Phase 2 — Bases Integration & Visual Polish

| # | Feature | Description |
|---|---------|-------------|
| 2.1 | **Auto-generate .base files** | When a type is created, optionally generate a `.base` file with default table view. |
| 2.2 | **Type-specific icons** | Show type icons in file explorer via CSS decorations or vault file icon overrides — see [OQ-7](#oq-7) |
| 2.3 | **Ghost file visual indicators** | Distinguish ghost notes from full notes (dimmed, badge, or icon variant). |
| 2.4 | **Type picker in note creation** | Enhanced "new note" flow: pick a type from a searchable list, then create with pre-filled frontmatter. |
| 2.5 | **Validation indicators** | When viewing a typed note, surface warnings for missing required fields or type mismatches (e.g., status bar, notice). |

### Phase 3 — Relations & Advanced Features

| # | Feature | Description |
|---|---------|-------------|
| 3.1 | **Relations between types** | Explicit `relation` property type linking to notes of a specific type — see [OQ-8](#oq-8) |
| 3.2 | **Embedded filtered views** | Typed notes can embed a Bases view filtered to related records (e.g., job vacancy embeds its interview steps). |
| 3.3 | **Type coercion on schema change** | When changing a property's type (text → select, text → number), prompt for conversion rules. |
| 3.4 | **Custom Bases view type** | Register a plugin-provided Bases view via `registerBasesView()` for richer typed-note display. |
| 3.5 | **Formulas** | Formula support — see [OQ-6](#oq-6). Likely deferred to Bases' native formula system. |
| 3.6 | **Template integration** | Interop with Obsidian Templates / Templater — see [OQ-14](#oq-14) |

---

## 5. Technical Design

### 5.1 Schema Engine

**Loading schemas on plugin start:**

```typescript
async onload() {
  this.schemas = await this.loadSchemas(); // from storage — OQ-2

  // React to frontmatter changes to keep the type index fresh
  this.registerEvent(
    this.app.metadataCache.on('changed', (file, data, cache) => {
      if (cache.frontmatter?.type) {
        this.noteIndex.update(file, cache.frontmatter.type);
      }
    })
  );

  // Wait for vault to be fully indexed before building initial index
  this.app.workspace.onLayoutReady(() => {
    this.noteIndex.buildInitialIndex();
  });
}
```

**Schema diffing:** When the user modifies a schema, the engine computes a diff:

```typescript
interface SchemaDiff {
  added: PropertyDefinition[];       // new properties to backfill
  removed: string[];                 // property keys to optionally strip
  renamed: { from: string; to: string }[];  // keys to rename
  typeChanged: { key: string; from: PropertyType; to: PropertyType }[];
  defaultChanged: { key: string; newDefault: unknown }[];
}

function diffSchemas(before: TypeSchema, after: TypeSchema): SchemaDiff;
```

Each diff category maps to a specific frontmatter operation. The UI presents this diff to the user before executing.

### 5.2 Frontmatter Manager

**Critical design constraint:** Never deserialize and reserialize the full YAML block. Use `processFrontMatter()` which provides an object reference — mutate only the target fields.

```typescript
async function updateNoteProperty(
  app: App,
  file: TFile,
  key: string,
  value: unknown
): Promise<void> {
  await app.fileManager.processFrontMatter(file, (frontmatter) => {
    frontmatter[key] = value;
  });
}

async function renameNoteProperty(
  app: App,
  file: TFile,
  oldKey: string,
  newKey: string
): Promise<void> {
  await app.fileManager.processFrontMatter(file, (frontmatter) => {
    if (oldKey in frontmatter) {
      frontmatter[newKey] = frontmatter[oldKey];
      delete frontmatter[oldKey];
    }
  });
}

async function removeNoteProperty(
  app: App,
  file: TFile,
  key: string
): Promise<void> {
  await app.fileManager.processFrontMatter(file, (frontmatter) => {
    delete frontmatter[key];
  });
}
```

**Important caveat:** `processFrontMatter()` does reserialize the YAML block it manages. Obsidian's own documentation says it "ensures a consistent layout of the YAML produced." This means it *may* reformat whitespace and ordering within the frontmatter section. However, it is the **officially recommended** approach, and it:
- Handles atomic edits (no conflicts with other plugins)
- Preserves content below the frontmatter
- Handles edge cases (no existing frontmatter, malformed YAML)

If users report formatting concerns, a future enhancement could use `vault.process()` with a regex-based approach for truly byte-precise edits. But start with `processFrontMatter()` — it's the platform-blessed path.

**Batch executor:**

```typescript
interface BatchResult {
  succeeded: TFile[];
  failed: { file: TFile; error: Error }[];
}

async function batchUpdate(
  app: App,
  files: TFile[],
  operation: (frontmatter: Record<string, unknown>) => void,
  onProgress?: (completed: number, total: number) => void
): Promise<BatchResult> {
  const result: BatchResult = { succeeded: [], failed: [] };

  for (let i = 0; i < files.length; i++) {
    try {
      await app.fileManager.processFrontMatter(files[i], operation);
      result.succeeded.push(files[i]);
    } catch (error) {
      result.failed.push({ file: files[i], error: error as Error });
    }
    onProgress?.(i + 1, files.length);
  }

  return result;
}
```

> **Error handling strategy is [OQ-13](#oq-13).** The above shows a skip-and-collect approach. The batch always runs to completion and reports failures at the end.

### 5.3 Note Manager

**Creating a typed note:**

```typescript
async function createTypedNote(
  app: App,
  schema: TypeSchema,
  title: string,
  ghost: boolean = false
): Promise<TFile> {
  const folder = ghost && schema.folder
    ? schema.folder
    : ''; // root or user-configured — OQ-3

  // Ensure folder exists
  if (folder && !app.vault.getAbstractFileByPath(folder)) {
    await app.vault.createFolder(folder);
  }

  // Build frontmatter content
  const frontmatter: Record<string, unknown> = { type: schema.id };
  for (const prop of schema.properties) {
    if (prop.default !== undefined) {
      frontmatter[prop.key] = prop.default;
    } else if (prop.required) {
      frontmatter[prop.key] = getEmptyValue(prop.type);
    }
  }

  // Build YAML
  const yaml = stringifyYaml(frontmatter);
  const content = `---\n${yaml}---\n`;

  const filePath = `${folder ? folder + '/' : ''}${sanitizeFileName(title)}.md`;
  return await app.vault.create(filePath, content);
}
```

**Note index:** An in-memory map of `typeId → Set<filePath>`, rebuilt on plugin load from MetadataCache and kept updated via the `metadataCache.on('changed')` event.

```typescript
class NoteIndex {
  private index: Map<string, Set<string>> = new Map();

  buildInitialIndex(): void {
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const type = cache?.frontmatter?.type;
      if (type && typeof type === 'string') {
        this.addToIndex(type, file.path);
      }
    }
  }

  getNotesOfType(typeId: string): TFile[] {
    const paths = this.index.get(typeId);
    if (!paths) return [];
    return [...paths]
      .map(p => this.app.vault.getAbstractFileByPath(p))
      .filter((f): f is TFile => f instanceof TFile);
  }

  update(file: TFile, typeId: string | undefined): void {
    // Remove from all types first
    for (const [, paths] of this.index) {
      paths.delete(file.path);
    }
    // Add to new type
    if (typeId) {
      this.addToIndex(typeId, file.path);
    }
  }

  private addToIndex(typeId: string, path: string): void {
    if (!this.index.has(typeId)) {
      this.index.set(typeId, new Set());
    }
    this.index.get(typeId)!.add(path);
  }
}
```

### 5.4 UI Layer

All UI uses Obsidian's native primitives:

| Surface | Component | Obsidian API |
|---|---|---|
| Schema editor | Main editing interface — see [OQ-4](#oq-4) | `Modal` or `ItemView` + `Setting` |
| Type picker | Choose type when creating a note | `SuggestModal<TypeSchema>` |
| Bulk update preview | Show diff before applying changes | `Modal` with list |
| Property editor | Add/edit a single property in the schema | `Modal` + `Setting` + `DropdownComponent` |
| Settings tab | Global plugin configuration | `PluginSettingTab` + `Setting` |
| File explorer icons | Type-specific icons on notes | `setIcon()` / CSS decoration |
| Context menu | Right-click actions on typed notes | `Menu` via file-menu event |

**Type picker modal example:**

```typescript
class TypePickerModal extends SuggestModal<TypeSchema> {
  private schemas: TypeSchema[];
  private onChoose: (schema: TypeSchema) => void;

  getSuggestions(query: string): TypeSchema[] {
    return this.schemas.filter(s =>
      s.name.toLowerCase().includes(query.toLowerCase())
    );
  }

  renderSuggestion(schema: TypeSchema, el: HTMLElement): void {
    el.createEl('div', { text: schema.name });
    el.createEl('small', {
      text: `${schema.properties.length} properties`,
      cls: 'typed-notes-suggestion-hint'
    });
    if (schema.icon) {
      setIcon(el.createSpan({ cls: 'typed-notes-suggestion-icon' }), schema.icon);
    }
  }

  onChooseSuggestion(schema: TypeSchema): void {
    this.onChoose(schema);
  }
}
```

### 5.5 Bases Integration

**Registering a custom Bases view (Phase 3):**

```typescript
import { BasesView, QueryController } from 'obsidian';

const TYPED_VIEW_TYPE = 'typed-notes-view';

// In plugin onload():
this.registerBasesView(TYPED_VIEW_TYPE, {
  name: 'Typed Notes',
  icon: 'lucide-layout-list',
  factory: (controller, containerEl) => {
    return new TypedBasesView(controller, containerEl, this);
  },
  options: () => ([
    {
      type: 'text',
      displayName: 'Note type',
      key: 'noteType',
      default: '',
    }
  ]),
});

class TypedBasesView extends BasesView {
  readonly type = TYPED_VIEW_TYPE;

  constructor(
    controller: QueryController,
    private containerEl: HTMLElement,
    private plugin: TypedNotesPlugin
  ) {
    super(controller);
  }

  public onDataUpdated(): void {
    const noteType = String(this.config.get('noteType'));
    const schema = this.plugin.schemas.find(s => s.id === noteType);

    // Render with schema-aware column headers, icons, validation badges
    this.containerEl.empty();
    // ... render logic using this.data.groupedData
  }
}
```

**Embedded filtered views** rely on Bases' native embed syntax (`![[mybase]]`). For dynamic filtering (e.g., "show interview steps for *this* vacancy"), the plugin would need to generate per-note `.base` files or leverage Bases' filter expressions if they support `this.file.name` context. This is a research item — the current Bases filter syntax supports `file.inFolder()`, `file.hasTag()`, and property comparisons, but self-referential filters may not be available yet.

### 5.6 File Explorer Decorations

Obsidian doesn't expose a public API for file explorer item decorations. Common community approaches:

1. **CSS-based:** Add a `data-type` attribute to file explorer items and use CSS to inject icons. Fragile — depends on internal DOM structure.
2. **Post-processing:** Listen to layout changes, query DOM for file items, inject icon elements. Also fragile.
3. **File icon override:** Obsidian 1.4+ supports `app.vault.getConfig('fileExplorerIcons')` — but this is undocumented.

The recommended approach for MVP is to **focus on the status bar and note header** for type indicators, and defer file explorer decoration to Phase 2 with a simple CSS-based approach that degrades gracefully.

---

## 6. Anti-Patterns (What This Plugin Must NOT Do)

These are explicit constraints derived from the failures of DB Folder and DataLoom.

### 6.1 Never reformat untouched YAML

**DB Folder's fatal mistake.** When editing a single property, the plugin must not reserialize the entire YAML block in a way that changes formatting of other fields. Use `processFrontMatter()` and only mutate the specific keys. If users report that `processFrontMatter()` itself reformats too aggressively, provide an opt-in "strict mode" using `vault.process()` with targeted regex edits.

### 6.2 Never use custom file formats for user data

**DataLoom's fatal mistake.** All user data must live in standard `.md` files with YAML frontmatter. No `.json`, `.loom`, `.db`, or any other format for content that users expect to be searchable, linkable, or visible in graph view. Schema definitions (plugin internals) may use any format, but **user content is always `.md`**.

### 6.3 Never depend on Dataview or other community plugins

**DB Folder's coupling mistake.** The plugin must be fully self-contained. It uses only Obsidian's built-in APIs (Vault, MetadataCache, FileManager, Workspace) and the Bases core plugin. No runtime dependency on any community plugin.

### 6.4 Never use custom UI components when native ones exist

**DB Folder's theme-breaking mistake.** Every UI surface must use Obsidian's `Modal`, `Setting`, `Menu`, `Notice`, `SuggestModal`, `FuzzySuggestModal`, `PluginSettingTab`, `ItemView`, and related primitives. No custom dropdown implementations, no custom table renderers for the schema editor, no custom context menus. This ensures:
- Automatic theme compatibility
- Mobile support
- Consistent keyboard navigation
- Accessibility

### 6.5 Never break the file explorer or other core UI

**DB Folder literally killed the file explorer.** The plugin must never monkey-patch core Obsidian components, intercept core commands destructively, or modify global prototypes. All modifications to the file explorer (icons, badges) must be additive and use documented extension points or safe DOM decoration.

### 6.6 Never assume frontmatter structure

Notes may have:
- No frontmatter at all
- A `type` field that doesn't match any known schema
- Properties that the schema doesn't define
- Properties with types that don't match the schema

The plugin must handle all these gracefully — surface warnings, never crash, never silently delete unknown properties.

### 6.7 Never create `.md` files without user intent

Ghost files and typed notes are created only through explicit user actions (command, button). The plugin never auto-creates `.md` files as a side effect of schema changes or index rebuilding.

---

## 7. Open Questions

Each question must be resolved before implementing the relevant feature. Questions are referenced throughout the document as `[OQ-N]`.

<a id="oq-1"></a>
### OQ-1: Plugin Name
**Status:** Unresolved
**Affects:** Package name, plugin ID, CSS class prefix, display throughout UI
**Question:** What should the plugin be called? Working title is "Typed Notes" — alternatives might include "Note Types", "Schemas", "NoteForge", etc. The name should be clear in the Obsidian community plugin listing.

<a id="oq-2"></a>
### OQ-2: Schema Storage Location and Format
**Status:** Unresolved
**Affects:** Phase 1 (schema engine), portability, version control
**Question:** Where and how should type schemas be stored?

| Option | Pros | Cons |
|---|---|---|
| `.yaml` files in `.obsidian/typed-notes/` | Clean separation; version-controllable if user tracks `.obsidian`; invisible in vault | Not visible in Obsidian UI; harder to share schemas between vaults |
| `.md` files in vault (e.g., `_types/book.md`) | Visible in vault; can be `[[linked]]`; version-controllable | Pollutes vault namespace; user might accidentally edit |
| Plugin data (`this.saveData()`) | Simplest implementation; single file | Not human-readable; harder to version control; lost if plugin data resets |
| Inside `.base` files as extended config | Tight Bases coupling; schema lives next to view | Couples schema to a specific view; confusing if multiple bases reference same type |

**Recommendation:** `.yaml` in `.obsidian/typed-notes/` for clean separation, with an export/import feature for sharing.

<a id="oq-3"></a>
### OQ-3: Ghost File Folder Structure
**Status:** Unresolved
**Affects:** Phase 1 (note creation), vault organization
**Question:** How should ghost files be organized?

- Single `_data/` root with subfolders per type (e.g., `_data/books/`, `_data/recipes/`)?
- User-configurable folder per type in the schema definition?
- Both (global default + per-type override)?
- What naming convention for ghost files? Title-based? Date-prefixed? UUID?

<a id="oq-4"></a>
### OQ-4: Visual Schema Editor Design
**Status:** Unresolved
**Affects:** Phase 1 (core UX)
**Question:** What form should the schema editor take?

| Option | Pros | Cons |
|---|---|---|
| Dedicated settings tab | Familiar location; easy to find | Cramped; not ideal for complex editing |
| Modal | Focused editing; consistent with Obsidian patterns | Can't see vault context while editing |
| Sidebar panel | Always accessible; can edit while viewing notes | Takes permanent space; complex layout |
| Custom view type (`ItemView`) | Full workspace leaf; can be tabbed/split; most space | Heavier implementation; might feel overbuilt for MVP |

<a id="oq-5"></a>
### OQ-5: Select/Multiselect Option Management
**Status:** Unresolved
**Affects:** Phase 1 (property types)
**Question:** How should predefined options for `select`/`multiselect` properties be managed?

- How are options added/removed/reordered?
- Do options have colors? If so, which palette? Obsidian's native tag colors? Custom?
- When an option is removed from the schema, what happens to notes that have that value? Warn? Auto-clear? Leave as-is?
- Should options be auto-discovered from existing values in the vault?

<a id="oq-6"></a>
### OQ-6: Formulas
**Status:** Unresolved
**Affects:** Phase 3
**Question:** How deep should formula support go?

- Bases already supports formulas in `.base` files (e.g., `'if(price, price.toFixed(2) + " dollars")'`). Should the plugin simply expose this via its schema editor?
- Should formulas be computable *outside* of Bases views (e.g., auto-populate a frontmatter field based on a formula)?
- Custom formula functions are on Obsidian's roadmap but not yet available — should we wait for that API?

<a id="oq-7"></a>
### OQ-7: Type-Specific Icons
**Status:** Unresolved
**Affects:** Phase 2
**Question:** How should users assign icons to types?

- Pick from Obsidian's built-in Lucide icon set? (simplest, consistent)
- Allow emoji? (cross-platform, but inconsistent rendering)
- Custom SVG upload via `addIcon()`? (flexible, but complex UX)
- Combination of the above?

<a id="oq-8"></a>
### OQ-8: Relations Between Types
**Status:** Unresolved
**Affects:** Phase 3
**Question:** How explicitly should the plugin model inter-type relations?

- **Minimal:** A `relation` property is just a text field expected to contain `[[wiki-links]]`. The plugin validates that the linked note exists and has the expected type. No special UI.
- **Structured:** The schema declares `relationType: "interview-step"`, and the plugin provides a specialized picker that only shows notes of that type. Backlink awareness, count summaries, embedded views.
- **Full relational:** Foreign keys, referential integrity checks, cascade behaviors (delete a vacancy → warn about orphaned interview steps).

<a id="oq-9"></a>
### OQ-9: Base Integration Depth
**Status:** Unresolved
**Affects:** Phase 2–3
**Question:** How tightly should the plugin integrate with Bases?

- **Light:** Plugin manages schemas only. User manually creates `.base` files. Plugin provides "Copy filter for this type" helper.
- **Medium:** Plugin auto-generates a default `.base` file when a type is created. User can customize it. Plugin updates filters if type ID changes.
- **Deep:** Plugin registers custom Bases view types with type-aware rendering, validation badges, relation navigation. Plugin manages `.base` files as owned artifacts.

<a id="oq-10"></a>
### OQ-10: Type Assignment Triggers
**Status:** Unresolved
**Affects:** Phase 1 (type detection)
**Question:** How does a note become "typed"?

- **Plugin-created only:** Notes created through the plugin's "New typed note" command get the `type` field. Existing notes are ignored unless the user explicitly assigns a type.
- **Auto-detect:** The plugin scans all notes. Any note with `type: <known-id>` in frontmatter is treated as typed, regardless of how it got there. User can manually type `type: book` in any note.
- **Hybrid:** Auto-detect, but with a first-time confirmation ("This note has `type: book` but was not created by Typed Notes. Manage it?")

**Recommendation:** Auto-detect silently. The `type` field is the contract — it doesn't matter how it got there.

<a id="oq-11"></a>
### OQ-11: Column Type System
**Status:** Unresolved
**Affects:** Phase 1 (property definitions)
**Question:** What is the exact list of supported property types?

Obsidian natively supports these frontmatter property types:
- `text` (string)
- `list` (YAML array of strings)
- `number`
- `checkbox` (boolean)
- `date` (YYYY-MM-DD)
- `datetime` (YYYY-MM-DDTHH:mm)
- `tags` (special — Obsidian indexes these)
- `aliases` (special — Obsidian uses for note aliases)

Should the plugin add:
- `select` / `multiselect` (stored as text/list in YAML but with constrained options in the UI)?
- `url` (stored as text but rendered as clickable link)?
- `relation` (stored as `[[wiki-link]]` text)?
- `rating` (stored as number but rendered as stars)?
- Others?

<a id="oq-12"></a>
### OQ-12: Minimum Obsidian Version
**Status:** Unresolved
**Affects:** All phases
**Question:** Should the plugin require Obsidian 1.10+ (Bases API available) or work without Bases?

- **1.10+:** Can use `registerBasesView()`, tight integration, but excludes users on older versions.
- **Graceful degradation:** Core schema/frontmatter features work on any version. Bases features are enabled only if Bases is available. More code to maintain.

<a id="oq-13"></a>
### OQ-13: Error Handling for Bulk Updates
**Status:** Unresolved
**Affects:** Phase 1 (schema evolution)
**Question:** When a bulk update fails partway through:

- **Skip and continue:** Process all files, collect errors, report at the end. Some notes updated, some not.
- **Stop on first error:** Halt immediately. Some notes updated, some not. User must manually resolve.
- **Transaction-like:** Dry-run first (validate all files can be updated), then execute. If any would fail, abort all.

The "transaction-like" approach is most complex but safest. The "skip and continue" approach is simplest and acceptable given that "the user has git" (per design decisions).

<a id="oq-14"></a>
### OQ-14: Template Integration
**Status:** Unresolved
**Affects:** Phase 3
**Question:** How should typed notes interact with Obsidian's template system?

- Should each type have an associated template that defines the note body (below frontmatter)?
- Should the plugin generate Templates-compatible template files from schemas?
- Should it integrate with Templater's `tp.` syntax?
- Or should body templates be out of scope entirely (the plugin only manages frontmatter)?

---

## 8. Implementation Phases

### Phase 1: MVP — Schema Engine + Frontmatter Management
**Goal:** Users can define types, create typed notes, and perform bulk schema changes.

```
Week 1-2: Project scaffolding
├── Initialize Obsidian plugin (esbuild, manifest.json, main.ts)
├── TypeScript strict mode, ESLint
├── Schema Engine: load/save/validate schemas
├── Data model types (TypeSchema, PropertyDefinition)
└── Schema storage implementation (pending OQ-2)

Week 3-4: Frontmatter operations
├── Frontmatter Manager: single-file CRUD via processFrontMatter()
├── Batch executor with progress callback
├── Note Manager: create typed notes, create ghost files
├── Note index: build from MetadataCache, maintain on changes
└── Schema diffing: compute added/removed/renamed fields

Week 5-6: UI
├── Schema editor (pending OQ-4): create/edit types and properties
├── Type picker modal: SuggestModal for choosing a type
├── Bulk update preview modal: show diff, confirm/cancel
├── Settings tab: type list, global configuration
├── Commands: "Create typed note", "Edit type schema", "Apply schema changes"
└── Context menu: "Set type" on right-click of any note

Week 7: Testing & polish
├── Manual testing across desktop + mobile
├── Edge cases: empty vaults, notes with no frontmatter, malformed YAML
├── Performance: vaults with 10k+ notes
└── Documentation: README, settings descriptions
```

**Milestone:** User can define a "Book" type with 5 properties, create 50 ghost book notes, add a new "genre" field, and have it backfilled across all 50 notes in one action.

### Phase 2: Bases Integration & Visual Polish
**Goal:** Typed notes are visually distinguished and have default database views.

```
├── Auto-generate .base files for types (pending OQ-9)
├── Type-specific icons in file explorer (pending OQ-7)
├── Ghost file visual indicators (dimmed appearance)
├── Enhanced type picker with icons and property preview
├── Validation: surface missing/invalid properties as warnings
├── "Open in Base" command: jump from a typed note to its Base view
└── Select/multiselect UI for constrained-option properties (pending OQ-5)
```

**Milestone:** Each type has an auto-generated Base view. Ghost notes are visually distinct. Type icons appear in the file explorer.

### Phase 3: Relations & Advanced Features
**Goal:** Types can reference each other. Advanced Bases integration.

```
├── Relation property type with type-constrained note picker
├── Embedded filtered views for related records
├── Custom Bases view type via registerBasesView()
├── Type coercion UI (change property type with conversion)
├── Formula support (pending OQ-6)
├── Template integration (pending OQ-14)
└── Import/export schemas (share between vaults)
```

**Milestone:** User has a "Job Vacancy" type and an "Interview Step" type. Each vacancy note embeds a filtered view of its interview steps. Adding a new field to Interview Step updates all records.

---

## Appendix A: Key Obsidian APIs

| API | Usage | Docs |
|---|---|---|
| `app.fileManager.processFrontMatter(file, fn)` | Surgical frontmatter edits | [Plugin Guidelines](https://docs.obsidian.md/plugins/Plugins/Releasing/Plugin+guidelines) |
| `app.vault.create(path, content)` | Create new notes | [Vault API](https://docs.obsidian.md/plugins/Plugins/Vault) |
| `app.vault.process(file, fn)` | Low-level file content transform | [Vault API](https://docs.obsidian.md/plugins/Plugins/Vault) |
| `app.metadataCache.getFileCache(file)` | Read cached frontmatter, links, tags | [MetadataCache](https://docs.obsidian.md/plugins/Plugins/Vault) |
| `app.metadataCache.on('changed', fn)` | React to metadata changes | Events API |
| `app.metadataCache.on('resolved', fn)` | All metadata indexed | Events API |
| `this.registerBasesView(type, config)` | Register custom Bases view | [Bases View Guide](https://docs.obsidian.md/plugins/guides/bases-view) |
| `BasesView.onDataUpdated()` | Render custom view content | [Bases View Guide](https://docs.obsidian.md/plugins/guides/bases-view) |
| `setIcon(el, iconName)` | Add Lucide icon to element | [Icons](https://docs.obsidian.md/plugins/Plugins/User+interface/Icons) |
| `addIcon(name, svg)` | Register custom SVG icon | [Icons](https://docs.obsidian.md/plugins/Plugins/User+interface/Icons) |
| `SuggestModal<T>` | Searchable suggestion list | UI API |
| `Modal`, `Setting` | Dialog and form building | UI API |
| `PluginSettingTab` | Plugin settings page | UI API |
| `Menu` | Context menus | UI API |
| `this.addCommand()` | Register command palette commands | Plugin API |
| `this.registerEvent()` | Subscribe to events (auto-cleanup) | Plugin API |
| `app.workspace.onLayoutReady(fn)` | Run after vault is indexed | Workspace API |

## Appendix B: File Structure (Proposed)

```
obsidian-typed-notes/
├── src/
│   ├── main.ts                  # Plugin entry point, lifecycle
│   ├── types.ts                 # TypeSchema, PropertyDefinition, etc.
│   ├── schema/
│   │   ├── SchemaEngine.ts      # Load, save, validate, diff schemas
│   │   └── SchemaStorage.ts     # Persistence layer (swappable per OQ-2)
│   ├── frontmatter/
│   │   ├── FrontmatterManager.ts # Single-file operations
│   │   └── BatchExecutor.ts      # Bulk updates with progress
│   ├── notes/
│   │   ├── NoteManager.ts       # Create, ghost files, promote
│   │   └── NoteIndex.ts         # Type → files index
│   ├── ui/
│   │   ├── SchemaEditorModal.ts # Visual schema editor
│   │   ├── TypePickerModal.ts   # SuggestModal for type selection
│   │   ├── BulkUpdateModal.ts   # Preview + confirm bulk changes
│   │   ├── PropertyEditorModal.ts # Add/edit single property
│   │   ├── SettingsTab.ts       # Plugin settings
│   │   └── FileExplorerIcons.ts # Type icon decorations
│   └── bases/
│       ├── BaseGenerator.ts     # Generate .base files from schemas
│       └── TypedBasesView.ts    # Custom Bases view (Phase 3)
├── styles.css                   # Minimal CSS (icon positioning, ghost dimming)
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
└── Plan.md                      # This document
```
