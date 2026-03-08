import { Notice, Plugin, TFile, TAbstractFile } from 'obsidian';
import { TypedNotesSettings, DEFAULT_SETTINGS, TypeSchema, SchemaDiff } from './types';
import { SchemaEngine } from './schema/SchemaEngine';
import { FrontmatterManager } from './frontmatter/FrontmatterManager';
import { BatchExecutor } from './frontmatter/BatchExecutor';
import { NoteIndex } from './notes/NoteIndex';
import { NoteManager } from './notes/NoteManager';
import { TypedNotesSettingTab } from './settings';
import { SchemaEditorModal } from './ui/SchemaEditorModal';
import { TypePickerModal } from './ui/TypePickerModal';
import { BulkUpdateModal } from './ui/BulkUpdateModal';
import { CreateNoteModal } from './ui/CreateNoteModal';
import { ConfirmModal } from './ui/ConfirmModal';

export default class TypedNotesPlugin extends Plugin {
	settings: TypedNotesSettings = DEFAULT_SETTINGS;
	schemaEngine!: SchemaEngine;
	noteIndex!: NoteIndex;
	noteManager!: NoteManager;
	frontmatterManager!: FrontmatterManager;
	batchExecutor!: BatchExecutor;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.schemaEngine = new SchemaEngine(this.app);
		this.noteIndex = new NoteIndex(this.app);
		this.noteManager = new NoteManager(this.app, this.settings, this.noteIndex);
		this.frontmatterManager = new FrontmatterManager(this.app);
		this.batchExecutor = new BatchExecutor(this.app);

		await this.schemaEngine.loadSchemas();

		this.addSettingTab(new TypedNotesSettingTab(this.app, this));

		this.registerCommands();
		this.registerEvents();

		this.app.workspace.onLayoutReady(() => {
			this.noteIndex.buildInitialIndex();
		});
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private registerCommands(): void {
		this.addCommand({
			id: 'add-note-type',
			name: 'Add new note type',
			callback: () => this.addNoteType(),
		});

		this.addCommand({
			id: 'edit-note-type',
			name: 'Edit note type',
			callback: () => this.editNoteType(),
		});

		this.addCommand({
			id: 'create-typed-note',
			name: 'Create note',
			callback: () => this.createTypedNote(),
		});

		this.addCommand({
			id: 'apply-schema-changes',
			name: 'Apply schema changes',
			callback: () => this.applySchemaChanges(),
		});

		this.addCommand({
			id: 'delete-note-type',
			name: 'Delete note type',
			callback: () => this.deleteNoteType(),
		});

		this.addCommand({
			id: 'set-note-type',
			name: 'Set note type',
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (checking) return !!file;
				if (file) this.setNoteType(file);
			},
		});

		this.addCommand({
			id: 'reload-types',
			name: 'Reload types',
			callback: () => this.reloadTypes(),
		});
	}

	private registerEvents(): void {
		this.registerEvent(
			this.app.metadataCache.on('changed', (file, _data, cache) => {
				const typeId = cache?.frontmatter?.['type'] as string | undefined;
				this.noteIndex.update(file, typeId);
			})
		);

		this.registerEvent(
			this.app.vault.on('delete', (file: TAbstractFile) => {
				this.noteIndex.handleDelete(file.path);
			})
		);

		this.registerEvent(
			this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
				this.noteIndex.handleDelete(oldPath);
				if (file instanceof TFile && file.extension === 'md') {
					const cache = this.app.metadataCache.getFileCache(file);
					const typeId = cache?.frontmatter?.['type'] as string | undefined;
					if (typeId) {
						this.noteIndex.update(file, typeId);
					}
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('modify', (file: TAbstractFile) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.noteManager.checkGhostPromotion(file);
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'md') {
					menu.addItem((item) => {
						item.setTitle('Set note type')
							.setIcon('tag')
							.onClick(() => this.setNoteType(file));
					});
				}
			})
		);
	}

	private addNoteType(): void {
		new SchemaEditorModal(
			this.app,
			null,
			async (schema: TypeSchema) => {
				await this.schemaEngine.saveSchema(schema);
				new Notice(`Type "${schema.name}" created`);
			},
			0
		).open();
	}

	private editNoteType(): void {
		if (this.schemaEngine.schemas.length === 0) {
			new Notice('No types defined yet');
			return;
		}
		new TypePickerModal(
			this.app,
			this.schemaEngine.schemas,
			this.noteIndex,
			(schema) => {
				const noteCount = this.noteIndex.getCount(schema.id);
				const originalSchema = JSON.parse(JSON.stringify(schema)) as TypeSchema;
				new SchemaEditorModal(
					this.app,
					schema,
					async (updated: TypeSchema, applyToNotes: boolean) => {
						await this.schemaEngine.saveSchema(updated);
						new Notice(`Type "${updated.name}" saved`);
						if (applyToNotes) {
							await this.executeBulkUpdate(originalSchema, updated);
						}
					},
					noteCount
				).open();
			}
		).open();
	}

	private createTypedNote(): void {
		if (this.schemaEngine.schemas.length === 0) {
			new Notice('No types defined yet. Create a type first.');
			return;
		}
		new TypePickerModal(
			this.app,
			this.schemaEngine.schemas,
			this.noteIndex,
			(schema) => {
				new CreateNoteModal(
					this.app,
					schema,
					async (values) => {
						const displayProp = schema.displayProperty || 'title';
						const title = String(values[displayProp] || '');
						const file = await this.noteManager.createTypedNote(schema, title, true, values);
						new Notice(`Note created: ${file.path}`);
						await this.app.workspace.getLeaf(false).openFile(file);
					}
				).open();
			}
		).open();
	}

	private applySchemaChanges(): void {
		if (this.schemaEngine.schemas.length === 0) {
			new Notice('No types defined yet');
			return;
		}
		new TypePickerModal(
			this.app,
			this.schemaEngine.schemas,
			this.noteIndex,
			(schema) => {
				const noteCount = this.noteIndex.getCount(schema.id);
				const originalSchema = JSON.parse(JSON.stringify(schema)) as TypeSchema;
				new SchemaEditorModal(
					this.app,
					schema,
					async (updated: TypeSchema) => {
						await this.schemaEngine.saveSchema(updated);
						await this.executeBulkUpdate(originalSchema, updated);
					},
					noteCount
				).open();
			}
		).open();
	}

	private async executeBulkUpdate(before: TypeSchema, after: TypeSchema): Promise<void> {
		const diff = this.schemaEngine.diffSchemas(before, after);
		const hasDiff = diff.added.length > 0 || diff.removed.length > 0 ||
			diff.renamed.length > 0 || diff.typeChanged.length > 0 ||
			diff.defaultChanged.length > 0;

		if (!hasDiff) {
			new Notice('No property changes to apply');
			return;
		}

		const files = this.noteIndex.getNotesOfType(after.id);
		if (files.length === 0) {
			new Notice('No notes of this type found');
			return;
		}

		new BulkUpdateModal(
			this.app,
			diff,
			files.length,
			async () => {
				await this.performBulkUpdate(files, diff);
			}
		).open();
	}

	private async performBulkUpdate(files: TFile[], diff: SchemaDiff): Promise<void> {
		const result = await this.batchExecutor.execute(
			files,
			(frontmatter) => {
				for (const prop of diff.added) {
					if (!(prop.key in frontmatter)) {
						frontmatter[prop.key] = prop.default !== undefined
							? prop.default
							: this.noteManager.getEmptyValue(prop.type);
					}
				}

				for (const key of diff.removed) {
					delete frontmatter[key];
				}

				for (const r of diff.renamed) {
					if (r.from in frontmatter) {
						frontmatter[r.to] = frontmatter[r.from];
						delete frontmatter[r.from];
					}
				}
			}
		);

		if (result.failed.length === 0) {
			new Notice(`Updated ${result.succeeded.length} notes`);
		} else {
			new Notice(
				`Updated ${result.succeeded.length}/${files.length} notes. ${result.failed.length} failed.`
			);
			console.error('Typed Notes: bulk update failures:', result.failed);
		}
	}

	private deleteNoteType(): void {
		if (this.schemaEngine.schemas.length === 0) {
			new Notice('No types defined yet');
			return;
		}
		new TypePickerModal(
			this.app,
			this.schemaEngine.schemas,
			this.noteIndex,
			(schema) => {
				const noteCount = this.noteIndex.getCount(schema.id);
				const message = noteCount > 0
					? `Delete type "${schema.name}"? ${noteCount} notes will keep their type field.`
					: `Delete type "${schema.name}"?`;

				new ConfirmModal(this.app, message, async () => {
					await this.schemaEngine.deleteSchema(schema.id);
					new Notice(`Type "${schema.name}" deleted`);
				}).open();
			}
		).open();
	}

	private setNoteType(file: TFile): void {
		if (this.schemaEngine.schemas.length === 0) {
			new Notice('No types defined yet');
			return;
		}
		new TypePickerModal(
			this.app,
			this.schemaEngine.schemas,
			this.noteIndex,
			async (schema) => {
				await this.frontmatterManager.updateProperty(file, 'type', schema.id);
				new Notice(`Set type to "${schema.name}"`);
			}
		).open();
	}

	private async reloadTypes(): Promise<void> {
		await this.schemaEngine.loadSchemas();
		this.noteIndex.buildInitialIndex();
		new Notice(`Loaded ${this.schemaEngine.schemas.length} types`);
	}
}
