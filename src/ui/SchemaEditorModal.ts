import { App, Modal, Setting, TextComponent, ButtonComponent } from 'obsidian';
import { TypeSchema, PropertyDefinition } from '../types';
import { PropertyEditorModal } from './PropertyEditorModal';

export class SchemaEditorModal extends Modal {
	private schema: TypeSchema | null;
	private onSave: (schema: TypeSchema, applyToNotes: boolean) => void;
	private noteCount: number;

	private id = '';
	private name = '';
	private icon = '';
	private displayProperty = 'title';
	private properties: PropertyDefinition[] = [];

	constructor(
		app: App,
		schema: TypeSchema | null,
		onSave: (schema: TypeSchema, applyToNotes: boolean) => void,
		noteCount: number
	) {
		super(app);
		this.schema = schema;
		this.onSave = onSave;
		this.noteCount = noteCount;

		if (schema) {
			this.id = schema.id;
			this.name = schema.name;
			this.icon = schema.icon ?? '';
			this.displayProperty = schema.displayProperty ?? 'title';
			this.properties = schema.properties.map((p) => ({ ...p }));
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass('typed-notes-schema-editor');
		contentEl.empty();
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', {
			text: this.schema ? 'Edit Type' : 'New Type',
		});

		const isEditing = this.schema !== null;

		new Setting(contentEl).setName('ID').addText((text: TextComponent) => {
			text.setValue(this.id).onChange((v) => (this.id = v));
			if (isEditing) {
				text.setDisabled(true);
			}
		});

		new Setting(contentEl)
			.setName('Name')
			.addText((text: TextComponent) => {
				text.setValue(this.name).onChange((v) => (this.name = v));
			});

		new Setting(contentEl)
			.setName('Icon')
			.setDesc('Lucide icon name')
			.addText((text: TextComponent) => {
				text.setValue(this.icon).onChange((v) => (this.icon = v));
			});

		new Setting(contentEl)
			.setName('Display Property')
			.addText((text: TextComponent) => {
				text.setValue(this.displayProperty).onChange(
					(v) => (this.displayProperty = v)
				);
			});

		// Properties list
		contentEl.createEl('h3', { text: 'Properties' });
		const propsContainer = contentEl.createDiv({
			cls: 'typed-notes-properties-list',
		});

		for (let i = 0; i < this.properties.length; i++) {
			const prop = this.properties[i];
			const row = new Setting(propsContainer);

			let desc = prop.type;
			if (prop.default != null) desc += `, default: ${prop.default}`;
			if (prop.required) desc += ', required';

			row.setName(prop.key).setDesc(desc);

			row.addButton((btn: ButtonComponent) => {
				btn.setButtonText('Edit').onClick(() => {
					new PropertyEditorModal(
						this.app,
						prop,
						(updated) => {
							this.properties[i] = updated;
							this.render();
						}
					).open();
				});
			});

			row.addButton((btn: ButtonComponent) => {
				btn.setButtonText('Delete').setWarning().onClick(() => {
					this.properties.splice(i, 1);
					this.render();
				});
			});
		}

		new Setting(propsContainer).addButton((btn: ButtonComponent) => {
			btn.setButtonText('Add Property').onClick(() => {
				new PropertyEditorModal(
					this.app,
					null,
					(newProp) => {
						this.properties.push(newProp);
						this.render();
					}
				).open();
			});
		});

		// Footer
		const footer = new Setting(contentEl);

		footer.addButton((btn: ButtonComponent) => {
			btn.setButtonText('Save').setCta().onClick(() => {
				this.saveSchema(false);
			});
		});

		if (isEditing && this.noteCount > 0) {
			footer.addButton((btn: ButtonComponent) => {
				btn.setButtonText(`Save & Apply to ${this.noteCount} notes`)
					.setCta()
					.onClick(() => {
						this.saveSchema(true);
					});
			});
		}

		footer.addButton((btn: ButtonComponent) => {
			btn.setButtonText('Cancel').onClick(() => {
				this.close();
			});
		});
	}

	private saveSchema(applyToNotes: boolean): void {
		if (!this.id.trim()) return;

		const schema: TypeSchema = {
			id: this.id.trim(),
			name: this.name.trim() || this.id.trim(),
			properties: [...this.properties],
		};
		if (this.icon.trim()) schema.icon = this.icon.trim();
		if (this.displayProperty.trim())
			schema.displayProperty = this.displayProperty.trim();
		this.onSave(schema, applyToNotes);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
