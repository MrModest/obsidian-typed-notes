import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type TypedNotesPlugin from './main';
import { SchemaEditorModal } from './ui/SchemaEditorModal';
import { FolderSuggest } from './ui/FolderSuggest';
import type { TypeSchema } from './types';

export class TypedNotesSettingTab extends PluginSettingTab {
	plugin: TypedNotesPlugin;

	constructor(app: App, plugin: TypedNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// --- Ghost Files ---
		containerEl.createEl('h3', { text: 'Ghost Files' });

		new Setting(containerEl)
			.setName('Ghost root folder')
			.addText((text) => {
				text
					.setPlaceholder('_data')
					.setValue(this.plugin.settings.ghostRoot)
					.onChange(async (value) => {
						this.plugin.settings.ghostRoot = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(containerEl)
			.setName('Slug suffix')
			.setDesc(
				'Append title slug to ghost filenames (e.g., 20260308-clean-code.md)'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useSlugSuffix)
					.onChange(async (value) => {
						this.plugin.settings.useSlugSuffix = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Move on promotion')
			.setDesc(
				'Move ghost files out of ghost folder when body content is added'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.moveOnPromotion)
					.onChange(async (value) => {
						this.plugin.settings.moveOnPromotion = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.moveOnPromotion) {
			new Setting(containerEl)
				.setName('Promotion target folder')
				.addText((text) => {
					text
						.setPlaceholder('leave empty for vault root')
						.setValue(this.plugin.settings.promotionTarget)
						.onChange(async (value) => {
							this.plugin.settings.promotionTarget = value;
							await this.plugin.saveSettings();
						});
					new FolderSuggest(this.app, text.inputEl);
				});
		}

		// --- Registered Types ---
		containerEl.createEl('h3', { text: 'Registered Types' });

		for (const schema of this.plugin.schemaEngine.schemas) {
			new Setting(containerEl)
				.setName(schema.name)
				.setDesc(
					`${schema.properties.length} properties · ${this.plugin.noteIndex.getCount(schema.id)} notes`
				)
				.addButton((btn) =>
					btn.setButtonText('Edit').onClick(() => {
						const noteCount = this.plugin.noteIndex.getCount(schema.id);
						const original = JSON.parse(JSON.stringify(schema)) as TypeSchema;
						new SchemaEditorModal(
							this.app,
							schema,
							async (updated: TypeSchema, applyToNotes: boolean) => {
								await this.plugin.schemaEngine.saveSchema(updated);
								new Notice(`Type "${updated.name}" saved`);
								if (applyToNotes) {
									const diff = this.plugin.schemaEngine.diffSchemas(original, updated);
									const files = this.plugin.noteIndex.getNotesOfType(updated.id);
									if (files.length > 0) {
										const { BulkUpdateModal } = await import('./ui/BulkUpdateModal');
										new BulkUpdateModal(this.app, diff, files.length, async () => {
											await this.plugin.batchExecutor.execute(files, (fm) => {
												for (const prop of diff.added) {
													if (!(prop.key in fm)) {
														fm[prop.key] = prop.default !== undefined ? prop.default : '';
													}
												}
												for (const key of diff.removed) delete fm[key];
												for (const r of diff.renamed) {
													if (r.from in fm) {
														fm[r.to] = fm[r.from];
														delete fm[r.from];
													}
												}
											});
											new Notice(`Updated ${files.length} notes`);
										}).open();
									}
								}
								this.display();
							},
							noteCount
						).open();
					})
				);
		}
	}
}
