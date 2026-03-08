> **Disclaimer:** This plugin was fully vibe-coded with [Claude Code](https://claude.ai/claude-code). Every line of code, every modal, every YAML schema — all generated through conversation with an AI. The author assumes you store your vault in git and can `git revert` any potential harm done by the plugin. If you don't — start now, before enabling this.

# Typed Notes for Obsidian

A **type system** for Obsidian notes. Define schemas (e.g., `book`, `recipe`, `job-vacancy`) with typed properties, defaults, and constraints. Notes bind to a type via a single `type: book` frontmatter field. The plugin then enforces, auto-populates, and bulk-updates notes by type.

## Why

Obsidian has templates but no schemas. Once a note is created from a template, the binding is gone — updating the template doesn't touch existing notes. Typed Notes fixes this:

- Define "a Book has these 7 fields" in one place
- Automatic propagation when the definition changes
- Lightweight "ghost" records (frontmatter-only `.md` files)
- Type-aware property editing with dropdowns, toggles, and date pickers

## Features

- **Schema definitions** stored as `.yaml` files in `.obsidian/note-types/`
- **Visual schema editor** — create and edit types with a modal UI
- **Typed note creation** — pick a type, fill properties, get a note with correct frontmatter
- **Ghost files** — data-only records in configurable folders, auto-promoted when you add body content
- **Schema evolution** — add, remove, or rename fields and bulk-update all notes of that type
- **Property editor** — edit typed note properties with type-appropriate inputs (select dropdowns, checkboxes, date pickers)
- **Auto-detection** — any note with `type: <known-id>` in frontmatter is managed, regardless of how it got there

## Commands

| Command | Description |
|---|---|
| Add new note type | Open schema editor to define a new type |
| Edit note type | Pick a type and modify its schema |
| Create note | Pick a type, fill properties, create a ghost note |
| Edit note properties | Edit the active note's properties with type-aware inputs |
| Apply schema changes | Pick a type, modify schema, bulk-update all notes |
| Delete note type | Remove a type definition (notes keep their `type` field) |
| Set note type | Assign a type to the active note |
| Reload types | Re-read schema files from disk |

## Settings

- **Ghost root folder** — where ghost files are stored (default: `_data`)
- **Slug suffix** — append title slug to filenames (e.g., `20260308-clean-code.md`)
- **Move on promotion** — automatically move ghost files out when body content is added
- **Promotion target folder** — where promoted files go

## Schema Format

Schemas are human-readable YAML in `.obsidian/note-types/`:

```yaml
id: book
name: Book
icon: book-open
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
        order: 1
      - value: reading
        order: 2
      - value: read
        order: 3
  - key: rating
    displayName: Rating
    type: number
```

## Supported Property Types

`text` · `number` · `checkbox` · `date` · `datetime` · `select` · `multiselect` · `tags` · `url` · `aliases` · `relation` · `list`

## Installation

1. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/typed-notes/`
2. Enable the plugin in Settings → Community Plugins
3. Create your first type with `Cmd/Ctrl+P` → "Typed Notes: Add new note type"

## Development

```bash
pnpm install
pnpm dev       # watch mode
pnpm build     # production build
```

## License

MIT
