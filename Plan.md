# Typed Notes for Obsidian — Implementation Plan

## 1. Executive Summary

**Typed Notes** adds a **type system** to Obsidian notes. A "type" is a named schema (e.g., `book`, `recipe`, `job-vacancy`) that declares the properties a note should have, their data types, defaults, validation, and display hints. Notes bind to a type via a single frontmatter field (`type: book`). The plugin then enforces, auto-populates, bulk-updates, and visually distinguishes notes by type.

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
┌───────────────────────────────────────────────────────────────┐
│                        Plugin Core                            │
│  main.ts — Plugin lifecycle, command registration, events     │
├──────────┬─────────────┬──────────┬──────────┬────────────────┤
│ Schema   │ Frontmatter │  Note    │   UI     │  Bases         │
│ Engine   │ Manager     │ Manager  │  Layer   │  Integration   │
├──────────┼─────────────┼──────────┼──────────┼────────────────┤
│- Load/   │- Surgical   │- Create  │- Schema  │- (Light for    │
│  save    │  edits      │  notes   │  editor  │   now: user    │
│  schemas │- Bulk       │- Ghost   │  modal   │   creates      │
│- Validate│  updates    │  files   │- Type    │   .base files  │
│- Diff    │- Skip &     │- Promote │  picker  │   manually)    │
│  changes │  continue   │  ghosts  │- Icons   │                │
└──────────┴─────────────┴──────────┴──────────┴────────────────┘
         │                │               │
         ▼                ▼               ▼
   .obsidian/          Obsidian Vault    Obsidian API
   note-types/         (.md files)      (MetadataCache,
   (YAML schemas)                       FileManager,
                                        Workspace)
```

### Component Responsibilities

**Schema Engine** — Loads type definitions from `.obsidian/note-types/*.yaml`, validates them, computes diffs when a schema changes ("field `rating` was added", "field `status` was renamed to `progress`"), and produces a changeset for the Frontmatter Manager.

**Frontmatter Manager** — The only component that touches file content. Wraps `app.fileManager.processFrontMatter()` for single-file edits and provides a batch executor for bulk updates with progress reporting and error collection (skip-and-continue strategy).

**Note Manager** — Handles note creation (full notes and ghost files), type assignment, ghost-to-full promotion (optional folder move), and the index of which notes belong to which type (backed by MetadataCache queries).

**UI Layer** — All user-facing surfaces: schema editor modal, type picker modal, settings tab, file explorer decorations. Built entirely on Obsidian's native `Modal`, `Setting`, `Menu`, `setIcon`, and related primitives.

**Bases Integration** — Light for MVP: plugin manages schemas only, users create `.base` files manually. Future phases add auto-generation and custom Bases view types.

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
  /** Lucide icon name for visual distinction */
  icon?: string;
  /** Subfolder name within the ghost root for this type's ghost files */
  folder?: string;
  /** Property key used as the displayed filename (e.g., 'title', 'name'). Defaults to 'title'. */
  displayProperty?: string;
  /** Ordered list of property definitions */
  properties: PropertyDefinition[];
}

interface PropertyDefinition {
  /** Property key as it appears in YAML frontmatter */
  key: string;
  /** Display name shown in UI and Bases column headers */
  displayName?: string;
  /** Data type */
  type: PropertyType;
  /** Default value (used when creating new notes or backfilling) */
  default?: unknown;
  /** Whether the property is required (shown in validation) */
  required?: boolean;
  /** For 'select' / 'multiselect' types */
  options?: SelectOption[];
  /** For relation types — target type ID */
  relationType?: string;
  /** For relation types — single [[link]] or list of [[links]] */
  relationCardinality?: 'single' | 'multi';
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
  | 'select'       // stored as text in YAML, constrained options in UI
  | 'multiselect'  // stored as list in YAML, constrained options in UI
  | 'tags'         // Obsidian-native tags property
  | 'url'          // stored as text, rendered as clickable link
  | 'aliases'      // Obsidian-native aliases property
  | 'relation'     // single: stored as [[wiki-link]] text; multi: stored as list of [[wiki-links]]
  | 'list';        // plain YAML list

interface SelectOption {
  value: string;
  /** Obsidian-style color, randomly assigned on creation */
  color?: string;
  /** Manual sort order — used when sorting by this select column */
  order: number;
}
```

### 3.2 Schema Storage

Schemas are stored as individual `.yaml` files in `.obsidian/note-types/`:

```
.obsidian/
  note-types/
    book.yaml
    recipe.yaml
    job-vacancy.yaml
```

Example `book.yaml`:

```yaml
id: book
name: Book
icon: lucide-book-open
folder: books
displayProperty: title
properties:
  - key: title
    displayName: Title
    type: text
    required: true
  - key: author
    displayName: Author
    type: text
  - key: status
    displayName: Status
    type: select
    default: to-read
    options:
      - value: to-read
        color: yellow
        order: 1
      - value: reading
        color: blue
        order: 2
      - value: read
        color: green
        order: 3
  - key: rating
    displayName: Rating
    type: number
  - key: tags
    type: tags
```

This keeps schemas out of the user's content space, is human-readable, and version-controllable if the user tracks `.obsidian/` in git.

### 3.3 Note–Type Binding

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

The `type` field is the **only** contract. The plugin **auto-detects** typed notes — any note with `type: <known-id>` in frontmatter is treated as typed, regardless of how it got there. Users can hand-write `type: book` in any note.

```typescript
// Finding all notes of a given type
function getNotesOfType(app: App, typeId: string): TFile[] {
  return app.vault.getMarkdownFiles().filter(file => {
    const cache = app.metadataCache.getFileCache(file);
    return cache?.frontmatter?.type === typeId;
  });
}
```

### 3.4 Ghost Files

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

That's the entire file. No body.

**Folder structure:**
- User configures a **ghost root directory** in plugin settings
- Default: subfolder within Obsidian's built-in "Default location for new notes" setting
- Each type gets a subfolder: `<ghost-root>/books/`, `<ghost-root>/recipes/`, etc.

**File naming:**
- Default: `YYYYMMDDHHmmss.md` (e.g., `20260308143025.md`)
- Optional slug suffix: `YYYYMMDDHHmmss-clean-code.md` (slug derived from the `displayProperty` value, sanitized for filename safety)
- The user relies on the **Front Matter Title** plugin to display the `title` property as the visible filename, so real filenames are secondary.

**Detection heuristic:** A note is a "ghost" if its body content (everything after the closing `---`) is empty or whitespace-only. This is a runtime check used for visual distinction (dimmed icon, badge, etc.).

**Promotion:** When a user writes prose below the frontmatter, the note silently transitions from "ghost" to "full note." Optionally (user setting), the plugin moves the file out of the ghost folder to a configurable location (e.g., the vault's default new note location or a per-type "full notes" folder).

### 3.5 .base File Integration (Light — MVP)

For MVP, the plugin does **not** auto-generate `.base` files. Users create Bases manually. The plugin provides a "Copy filter for this type" helper command that puts the correct filter snippet on the clipboard:

```yaml
filters:
  and:
    - 'type = "book"'
```

Future phases will add auto-generation and deeper Bases integration.

---

## 4. Core Features

### Phase 1 — MVP

| # | Feature | Description |
|---|---------|-------------|
| 1.1 | **Schema definition** | Define types with properties, types, defaults. Stored as `.yaml` in `.obsidian/note-types/`. |
| 1.2 | **Schema editor modal** | Command palette → "Add new note type" → type ID → modal for property editing. "Edit existing note type" → type picker → modal. |
| 1.3 | **Note creation** | Create a new note of a given type (command palette + modal). Auto-populates frontmatter from schema. |
| 1.4 | **Ghost file creation** | Create data-only records in `<ghost-root>/<type>/` with timestamp filenames. |
| 1.5 | **Type detection** | Auto-detect: index all notes by scanning frontmatter `type` field. React to MetadataCache changes. |
| 1.6 | **Schema evolution — add/remove fields** | Add a new property → backfill across all notes of that type. Remove a property → clear value if not required, block if required and in use. |
| 1.7 | **Schema evolution — rename fields** | Rename a property key across all notes of that type. |
| 1.8 | **Bulk update preview + confirmation** | Before any schema change touches files, show a preview: "This will modify N notes. Fields affected: ..." User confirms or cancels. |
| 1.9 | **Delete type** | Delete a type schema. Existing notes keep their `type` field as-is (orphaned). |
| 1.10 | **Reload types** | Command to re-read schema files from disk, for users who hand-edit YAML. Schemas also reload on plugin start. |
| 1.11 | **Settings tab** | Plugin settings: ghost root folder, slug suffix toggle, promotion behavior, type list overview. |

### Phase 2 — Visual Polish & Bases Helpers

| # | Feature | Description |
|---|---------|-------------|
| 2.1 | **Type-specific icons** | Lucide icon picker in schema editor. Show type icons in file explorer via CSS decorations. |
| 2.2 | **Ghost file visual indicators** | Distinguish ghost notes from full notes (dimmed, badge, or icon variant). |
| 2.3 | **Type picker in note creation** | Enhanced "new note" flow: pick a type from a searchable list with icons and property preview. |
| 2.4 | **Validation indicators** | Surface warnings for missing required fields or type mismatches (status bar, notice). |
| 2.5 | **Select/multiselect UI** | Color-tagged options with manual ordering, Obsidian-style palette, random color assignment. |
| 2.6 | **Bases helpers** | "Copy filter for this type" command. Documentation/guidance for setting up Bases views. |

### Phase 3 — Relations & Advanced Bases

| # | Feature | Description |
|---|---------|-------------|
| 3.1 | **Relations between types** | Structured `relation` property with `single` (one `[[link]]`) or `multi` (list of `[[links]]`) cardinality. Schema declares target type. Type-constrained note picker. |
| 3.2 | **Dot-notation property traversal** | Access related type properties (e.g., `interview-step.vacancy.name`) — depends on custom Bases view or future Bases custom functions API. |
| 3.3 | **Embedded filtered views** | Typed notes embed Bases views filtered to related records (e.g., vacancy embeds its interview steps). |
| 3.4 | **Custom Bases view type** | Register a plugin-provided Bases view via `registerBasesView()` for type-aware rendering. |
| 3.5 | **Auto-generate .base files** | Optionally generate a default `.base` file per type with table view, filters, and columns. |
| 3.6 | **Type coercion on schema change** | When changing a property's type (text → select, text → number), prompt for conversion rules. |
| 3.7 | **Import/export schemas** | Share type definitions between vaults. |

**Explicitly out of scope:** Formulas (defer to Bases' native formula system), template integration (plugin manages frontmatter only, not note body content).

---

## 5. Technical Design

### 5.1 Schema Engine

**Loading schemas on plugin start:**

```typescript
async onload() {
  this.schemas = await this.loadSchemas();

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

**Schema loading from `.obsidian/note-types/`:**

```typescript
async loadSchemas(): Promise<TypeSchema[]> {
  const schemasPath = `${this.app.vault.configDir}/note-types`;
  const schemas: TypeSchema[] = [];

  // Ensure directory exists
  if (!await this.app.vault.adapter.exists(schemasPath)) {
    await this.app.vault.adapter.mkdir(schemasPath);
    return schemas;
  }

  const files = await this.app.vault.adapter.list(schemasPath);
  for (const filePath of files.files) {
    if (filePath.endsWith('.yaml')) {
      const content = await this.app.vault.adapter.read(filePath);
      const schema = parseYaml(content) as TypeSchema;
      schemas.push(schema);
    }
  }

  return schemas;
}

async saveSchema(schema: TypeSchema): Promise<void> {
  const path = `${this.app.vault.configDir}/note-types/${schema.id}.yaml`;
  const content = stringifyYaml(schema);
  await this.app.vault.adapter.write(path, content);
}
```

**Schema diffing:** When the user modifies a schema, the engine computes a diff:

```typescript
interface SchemaDiff {
  added: PropertyDefinition[];       // new properties to backfill
  removed: string[];                 // property keys to strip or block
  renamed: { from: string; to: string }[];  // keys to rename
  typeChanged: { key: string; from: PropertyType; to: PropertyType }[];
  defaultChanged: { key: string; newDefault: unknown }[];
}

function diffSchemas(before: TypeSchema, after: TypeSchema): SchemaDiff;
```

Each diff category maps to a specific frontmatter operation. The UI presents this diff to the user before executing.

**Select option removal rules:**
- If a select option is removed and the property is **not required**: clear the value from all notes that have it
- If a select option is removed and the property is **required**: block removal until no notes use that option value (show count of affected notes)

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

**Batch executor (skip-and-continue):**

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

On completion, the UI shows: "Updated 198/200 notes. 2 failed: [clickable file list with error reasons]."

### 5.3 Note Manager

**Creating a typed note:**

```typescript
async function createTypedNote(
  app: App,
  schema: TypeSchema,
  title: string,
  ghost: boolean = false
): Promise<TFile> {
  const ghostRoot = plugin.settings.ghostRoot; // user-configured
  const folder = ghost
    ? `${ghostRoot}/${schema.folder || schema.id}`
    : ''; // vault default or user-configured

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

  // Add display property value to frontmatter (for Front Matter Title plugin)
  const displayProp = schema.displayProperty || 'title';
  if (title && !frontmatter[displayProp]) {
    frontmatter[displayProp] = title;
  }

  // Build YAML
  const yaml = stringifyYaml(frontmatter);
  const content = `---\n${yaml}---\n`;

  // Generate filename: YYYYMMDDHHmmss or YYYYMMDDHHmmss-slug
  const timestamp = formatTimestamp(new Date()); // "20260308143025"
  const slug = plugin.settings.useSlugSuffix ? `-${slugify(title)}` : '';
  const fileName = `${timestamp}${slug}`;
  const filePath = `${folder ? folder + '/' : ''}${fileName}.md`;

  return await app.vault.create(filePath, content);
}

function formatTimestamp(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}${mo}${d}${h}${mi}${s}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
```

**Ghost promotion (optional move on body content):**

```typescript
// In metadataCache 'changed' handler or vault 'modify' handler:
async function checkGhostPromotion(file: TFile): Promise<void> {
  if (!plugin.settings.moveOnPromotion) return;

  const content = await app.vault.cachedRead(file);
  const bodyStart = content.indexOf('---', content.indexOf('---') + 3);
  if (bodyStart === -1) return;

  const body = content.substring(bodyStart + 3).trim();
  if (body.length === 0) return; // still a ghost

  // File has body content — check if it's in a ghost folder
  const ghostRoot = plugin.settings.ghostRoot;
  if (!file.path.startsWith(ghostRoot)) return; // not in ghost folder

  // Move to promotion target folder
  const targetFolder = plugin.settings.promotionTarget || '';
  const newPath = `${targetFolder ? targetFolder + '/' : ''}${file.name}`;
  await app.fileManager.renameFile(file, newPath);
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

  getCount(typeId: string): number {
    return this.index.get(typeId)?.size ?? 0;
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
| Schema editor | Modal for creating/editing types | `Modal` + `Setting` |
| Type picker | Choose type when creating a note | `SuggestModal<TypeSchema>` |
| Bulk update preview | Show diff before applying changes | `Modal` with list |
| Property editor | Add/edit a single property in the schema | `Modal` + `Setting` + `DropdownComponent` |
| Settings tab | Global plugin configuration | `PluginSettingTab` + `Setting` |
| File explorer icons | Type-specific Lucide icons on notes | `setIcon()` / CSS decoration |
| Context menu | Right-click actions on typed notes | `Menu` via file-menu event |

**Command palette commands (MVP):**

| Command | Flow |
|---|---|
| "Typed Notes: Add new note type" | Prompt for type ID → open schema editor modal |
| "Typed Notes: Edit note type" | Type picker → open schema editor modal |
| "Typed Notes: Create typed note" | Type picker → title prompt → create note |
| "Typed Notes: Create ghost note" | Type picker → title prompt → create ghost file |
| "Typed Notes: Apply schema changes" | Type picker → show diff → confirm → bulk update |
| "Typed Notes: Delete note type" | Type picker → confirm → delete schema file. Existing notes keep their `type` field as-is. |
| "Typed Notes: Set note type" | Type picker → assign type to current note |
| "Typed Notes: Reload types" | Re-read all `.yaml` files from `.obsidian/note-types/` and rebuild index |

**Schema editor modal flow:**

```
┌──────────────────────────────────────────────┐
│  Edit Type: Book                        [X]  │
│                                              │
│  ID:   book                                  │
│  Name: Book                                  │
│  Icon: 📖 [Change...]                        │
│  Display as: title  [▼]                      │
│  Ghost folder: books                         │
│                                              │
│  Properties:                                 │
│  ┌────────┬────────┬──────────┬───────────┐  │
│  │ Key    │ Type   │ Default  │ Required  │  │
│  ├────────┼────────┼──────────┼───────────┤  │
│  │ title  │ text   │          │ ✓         │  │
│  │ author │ text   │          │           │  │
│  │ status │ select │ to-read  │           │  │
│  │ rating │ number │          │           │  │
│  │ tags   │ tags   │          │           │  │
│  └────────┴────────┴──────────┴───────────┘  │
│  [+ Add Property]                            │
│                                              │
│  [Save]  [Save & Apply to N notes]  [Cancel] │
└──────────────────────────────────────────────┘
```

Built using `Setting` components for each property row, `DropdownComponent` for type selection, `ToggleComponent` for required checkbox.

**Type picker modal:**

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
    const container = el.createDiv({ cls: 'typed-notes-suggestion' });
    if (schema.icon) {
      setIcon(container.createSpan({ cls: 'typed-notes-suggestion-icon' }), schema.icon);
    }
    const text = container.createDiv();
    text.createEl('div', { text: schema.name });
    text.createEl('small', {
      text: `${schema.properties.length} properties · ${this.plugin.noteIndex.getCount(schema.id)} notes`,
      cls: 'typed-notes-suggestion-hint'
    });
  }

  onChooseSuggestion(schema: TypeSchema): void {
    this.onChoose(schema);
  }
}
```

### 5.5 Bases Integration (Phase 3)

**Registering a custom Bases view:**

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

**Embedded filtered views** rely on Bases' native embed syntax (`![[mybase]]`). For dynamic filtering (e.g., "show interview steps for *this* vacancy"), the plugin would need to generate per-note `.base` files or leverage Bases' filter expressions if they support `this.file.name` context. This is a research item for Phase 3.

**Relation property traversal** (`interview-step.vacancy.name`) is the long-term goal. This likely depends on either:
- A custom Bases view that resolves relation chains and renders the target property
- The Bases custom functions API (on Obsidian's roadmap but not yet available)

### 5.6 File Explorer Decorations (Phase 2)

Obsidian doesn't expose a public API for file explorer item decorations. Common community approaches:

1. **CSS-based:** Add a `data-type` attribute to file explorer items and use CSS to inject icons. Fragile — depends on internal DOM structure.
2. **Post-processing:** Listen to layout changes, query DOM for file items, inject icon elements. Also fragile.
3. **File icon override:** Obsidian 1.4+ supports `app.vault.getConfig('fileExplorerIcons')` — but this is undocumented.

Approach for Phase 2: a simple CSS-based method that degrades gracefully. For MVP, focus on the status bar and note header for type indicators.

---

## 6. Anti-Patterns (What This Plugin Must NOT Do)

These are explicit constraints derived from the failures of DB Folder and DataLoom.

### 6.1 Never reformat untouched YAML

**DB Folder's fatal mistake.** When editing a single property, the plugin must not reserialize the entire YAML block in a way that changes formatting of other fields. Use `processFrontMatter()` and only mutate the specific keys. If users report that `processFrontMatter()` itself reformats too aggressively, provide an opt-in "strict mode" using `vault.process()` with targeted regex edits.

### 6.2 Never use custom file formats for user data

**DataLoom's fatal mistake.** All user data must live in standard `.md` files with YAML frontmatter. No `.json`, `.loom`, `.db`, or any other format for content that users expect to be searchable, linkable, or visible in graph view. Schema definitions (plugin internals) use `.yaml` in `.obsidian/`, but **user content is always `.md`**.

### 6.3 Never depend on Dataview or other community plugins

**DB Folder's coupling mistake.** The plugin must be fully self-contained. It uses only Obsidian's built-in APIs (Vault, MetadataCache, FileManager, Workspace) and the Bases core plugin. No runtime dependency on any community plugin.

### 6.4 Never use custom UI components when native ones exist

**DB Folder's theme-breaking mistake.** Every UI surface must use Obsidian's `Modal`, `Setting`, `Menu`, `Notice`, `SuggestModal`, `FuzzySuggestModal`, `PluginSettingTab`, and related primitives. No custom dropdown implementations, no custom table renderers for the schema editor, no custom context menus. This ensures:
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

## 7. Resolved Decisions

Summary of all design decisions made during planning.

| # | Question | Decision |
|---|----------|----------|
| 1 | Plugin name | **Typed Notes** |
| 2 | Schema storage | `.yaml` files in `.obsidian/note-types/` |
| 3 | Ghost file folders | User-defined ghost root (default: Obsidian's new note location), subfolders per type. Filenames: `YYYYMMDDHHmmss.md` with optional slug suffix. Optional move on promotion. |
| 4 | Schema editor UI | Modal, accessed via command palette ("Add new note type" / "Edit existing note type") |
| 5 | Select/multiselect options | Color (Obsidian-style, randomly assigned) + manual sort order. Removal: clear value if not required, block if required and in use. No auto-discovery. |
| 6 | Formulas | Deferred — use Bases' native formula system |
| 7 | Type icons | Lucide icon picker |
| 8 | Relations | Structured: schema declares target type + cardinality (`single`/`multi`), stored as `[[wiki-link]]`(s), type-constrained picker. Goal: dot-notation traversal (`vacancy.name`). Phase 3. |
| 9 | Bases integration | Light for MVP (user creates `.base` files manually). Deep integration in Phase 3. |
| 10 | Type assignment | Auto-detect: any note with `type: <known-id>` is managed, regardless of origin. |
| 11 | Column types | `text`, `number`, `checkbox`, `date`, `datetime`, `select`, `multiselect`, `tags`, `url`, `aliases`, `relation`, `list` |
| 12 | Min Obsidian version | Latest only (1.10+), no backwards compatibility |
| 13 | Bulk update errors | Skip and continue — process all files, collect errors, report at the end |
| 14 | Template integration | Out of scope — plugin manages frontmatter only |
| 15 | Filename collision | Timestamps include seconds (`YYYYMMDDHHmmss`) |
| 16 | Deleting a type | Delete schema file only. Existing notes keep `type` field as-is. |
| 17 | `type` property key | Hard contract on `type` for now. May become configurable later. |
| 18 | Display property | Per-type `displayProperty` setting (defaults to `title`). Used for slug suffix and Front Matter Title. |
| 19 | Schema hot-reload | Load on plugin start only. Manual "Reload types" command available. |
| 20 | Relation cardinality | `single` (one `[[link]]`) or `multi` (list of `[[links]]`) per relation property. |
| 21 | Property reordering | Supported in schema editor via drag-to-reorder. Order is persisted in schema YAML. |

---

## 8. Implementation Phases

### Phase 1: MVP — Schema Engine + Frontmatter Management
**Goal:** Users can define types, create typed notes, and perform bulk schema changes.
**Target:** Obsidian 1.10+

```
Week 1-2: Project scaffolding + Schema Engine
├── Initialize Obsidian plugin (esbuild, manifest.json, main.ts)
├── TypeScript strict mode, ESLint
├── Data model types (TypeSchema, PropertyDefinition, etc.)
├── Schema Engine: load/save/validate .yaml schemas from .obsidian/note-types/
├── Schema diffing: compute added/removed/renamed fields
└── Plugin settings: ghost root, slug toggle, promotion behavior

Week 3-4: Frontmatter operations + Note management
├── Frontmatter Manager: single-file CRUD via processFrontMatter()
├── Batch executor: skip-and-continue with progress callback
├── Note Manager: create typed notes with timestamp filenames
├── Ghost file creation in <ghost-root>/<type>/ folders
├── Ghost promotion detection + optional move
└── Note index: build from MetadataCache, maintain on changes

Week 5-6: UI
├── Schema editor modal: create/edit types and properties
├── Type picker modal: SuggestModal with note counts
├── Bulk update preview modal: show diff, confirm/cancel
├── Settings tab: ghost root, slug suffix, promotion settings
├── Commands: all 8 command palette entries
└── Context menu: "Set type" on right-click

Week 7: Testing & polish
├── Manual testing across desktop + mobile
├── Edge cases: empty vaults, no frontmatter, malformed YAML, unknown types
├── Performance: vaults with 10k+ notes
└── Documentation: README, settings descriptions
```

**Milestone:** User can define a "Book" type with 5 properties, create 50 ghost book notes (as `YYYYMMDDHHmmss.md` files in `_data/books/`), add a new "genre" field, and have it backfilled across all 50 notes in one action.

### Phase 2: Visual Polish & Bases Helpers
**Goal:** Typed notes are visually distinguished and Bases usage is streamlined.

```
├── Lucide icon picker in schema editor
├── Type-specific icons in file explorer (CSS decoration)
├── Ghost file visual indicators (dimmed appearance)
├── Enhanced type picker with icons and property preview
├── Validation: surface missing/invalid properties as warnings
├── Select/multiselect: color options, manual ordering, Obsidian-style palette
├── "Copy filter for this type" command
└── "Copy Bases config for this type" command
```

**Milestone:** Types have icons. Ghost notes are visually distinct. Select properties have colored options. User can quickly set up a Base view from the plugin's helper commands.

### Phase 3: Relations & Advanced Bases
**Goal:** Types can reference each other. Deep Bases integration.

```
├── Relation property type: schema declares target type
├── Type-constrained note picker for relation fields
├── Wiki-link storage for relations ("[[note-name]]")
├── Custom Bases view type via registerBasesView()
├── Dot-notation property traversal in custom view (vacancy.name)
├── Auto-generate .base files per type
├── Embedded filtered views for related records
├── Type coercion UI (change property type with conversion)
└── Import/export schemas (share between vaults)
```

**Milestone:** User has a "Job Vacancy" type and an "Interview Step" type. Each interview step has a `vacancy` relation field. The custom Bases view shows `vacancy.name` as a resolved column. Adding a new field to Interview Step updates all records.

---

## Appendix A: Key Obsidian APIs

| API | Usage | Docs |
|---|---|---|
| `app.fileManager.processFrontMatter(file, fn)` | Surgical frontmatter edits | [Plugin Guidelines](https://docs.obsidian.md/plugins/Plugins/Releasing/Plugin+guidelines) |
| `app.vault.create(path, content)` | Create new notes | [Vault API](https://docs.obsidian.md/plugins/Plugins/Vault) |
| `app.vault.process(file, fn)` | Low-level file content transform | [Vault API](https://docs.obsidian.md/plugins/Plugins/Vault) |
| `app.vault.adapter.read/write/exists/mkdir` | Direct filesystem access (for `.obsidian/` files) | Adapter API |
| `app.metadataCache.getFileCache(file)` | Read cached frontmatter, links, tags | [MetadataCache](https://docs.obsidian.md/plugins/Plugins/Vault) |
| `app.metadataCache.on('changed', fn)` | React to metadata changes | Events API |
| `app.metadataCache.on('resolved', fn)` | All metadata indexed | Events API |
| `app.fileManager.renameFile(file, newPath)` | Move/rename files (ghost promotion) | FileManager API |
| `this.registerBasesView(type, config)` | Register custom Bases view (Phase 3) | [Bases View Guide](https://docs.obsidian.md/plugins/guides/bases-view) |
| `BasesView.onDataUpdated()` | Render custom view content | [Bases View Guide](https://docs.obsidian.md/plugins/guides/bases-view) |
| `setIcon(el, iconName)` | Add Lucide icon to element | [Icons](https://docs.obsidian.md/plugins/Plugins/User+interface/Icons) |
| `SuggestModal<T>` | Searchable suggestion list | UI API |
| `Modal`, `Setting` | Dialog and form building | UI API |
| `PluginSettingTab` | Plugin settings page | UI API |
| `Menu` | Context menus | UI API |
| `this.addCommand()` | Register command palette commands | Plugin API |
| `this.registerEvent()` | Subscribe to events (auto-cleanup) | Plugin API |
| `app.workspace.onLayoutReady(fn)` | Run after vault is indexed | Workspace API |
| `parseYaml() / stringifyYaml()` | YAML serialization (Obsidian built-in) | Utility API |

## Appendix B: File Structure (Proposed)

```
obsidian-typed-notes/
├── src/
│   ├── main.ts                  # Plugin entry point, lifecycle
│   ├── types.ts                 # TypeSchema, PropertyDefinition, etc.
│   ├── schema/
│   │   ├── SchemaEngine.ts      # Load, save, validate, diff schemas
│   │   └── SchemaStorage.ts     # Read/write .yaml in .obsidian/note-types/
│   ├── frontmatter/
│   │   ├── FrontmatterManager.ts # Single-file operations via processFrontMatter()
│   │   └── BatchExecutor.ts      # Bulk updates, skip-and-continue
│   ├── notes/
│   │   ├── NoteManager.ts       # Create typed notes, ghost files, promotion
│   │   ├── NoteIndex.ts         # Type → files index, MetadataCache sync
│   │   └── naming.ts            # Timestamp + slug filename generation
│   ├── ui/
│   │   ├── SchemaEditorModal.ts # Visual schema editor (Modal + Settings)
│   │   ├── TypePickerModal.ts   # SuggestModal for type selection
│   │   ├── BulkUpdateModal.ts   # Preview + confirm bulk changes
│   │   ├── PropertyEditorModal.ts # Add/edit single property
│   │   ├── SettingsTab.ts       # Plugin settings
│   │   └── FileExplorerIcons.ts # Type icon decorations (Phase 2)
│   └── bases/
│       ├── BaseHelpers.ts       # "Copy filter" command, config snippets
│       └── TypedBasesView.ts    # Custom Bases view (Phase 3)
├── styles.css                   # Minimal CSS (icon positioning, ghost dimming)
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
└── Plan.md                      # This document
```
