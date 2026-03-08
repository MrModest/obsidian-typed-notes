import { App, Modal, Setting, ButtonComponent } from 'obsidian';
import { TypeSchema } from '../types';
import { renderPropertyField } from './PropertyFields';

export class EditNoteModal extends Modal {
	private schema: TypeSchema;
	private values: Record<string, unknown> = {};
	private onSave: (values: Record<string, unknown>) => void;

	constructor(
		app: App,
		schema: TypeSchema,
		currentValues: Record<string, unknown>,
		onSave: (values: Record<string, unknown>) => void
	) {
		super(app);
		this.schema = schema;
		this.onSave = onSave;

		// Copy current frontmatter values for schema properties
		for (const prop of schema.properties) {
			if (currentValues[prop.key] !== undefined) {
				this.values[prop.key] = currentValues[prop.key];
			}
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass('typed-notes-note-modal');
		contentEl.createEl('h3', { text: `Edit ${this.schema.name}` });

		for (const prop of this.schema.properties) {
			renderPropertyField(contentEl, prop, this.values);
		}

		new Setting(contentEl)
			.addButton((btn: ButtonComponent) =>
				btn.setButtonText('Save').setCta().onClick(() => {
					this.close();
					this.onSave(this.values);
				})
			)
			.addButton((btn: ButtonComponent) =>
				btn.setButtonText('Cancel').onClick(() => this.close())
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
