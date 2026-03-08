import { App, Modal, Setting, ButtonComponent } from 'obsidian';
import { TypeSchema } from '../types';
import { renderPropertyField } from './PropertyFields';

export class CreateNoteModal extends Modal {
	private schema: TypeSchema;
	private values: Record<string, unknown> = {};
	private onSubmit: (values: Record<string, unknown>) => void;

	constructor(
		app: App,
		schema: TypeSchema,
		onSubmit: (values: Record<string, unknown>) => void
	) {
		super(app);
		this.schema = schema;
		this.onSubmit = onSubmit;

		for (const prop of schema.properties) {
			if (prop.default !== undefined) {
				this.values[prop.key] = prop.default;
			}
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass('typed-notes-note-modal');
		contentEl.createEl('h3', { text: `New ${this.schema.name}` });

		const displayProp = this.schema.displayProperty || 'title';
		const displayDef = this.schema.properties.find((p) => p.key === displayProp);
		const displayLabel = displayDef?.displayName || displayProp;

		const inputEl = contentEl.createEl('input', {
			type: 'text',
			placeholder: displayLabel,
			cls: 'typed-notes-text-input',
		});
		if (this.values[displayProp] != null) {
			inputEl.value = String(this.values[displayProp]);
		}
		inputEl.addEventListener('input', () => {
			this.values[displayProp] = inputEl.value;
		});
		inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.submit();
			}
		});

		for (const prop of this.schema.properties) {
			if (prop.key === displayProp) continue;
			renderPropertyField(contentEl, prop, this.values);
		}

		new Setting(contentEl)
			.addButton((btn: ButtonComponent) =>
				btn.setButtonText('Create').setCta().onClick(() => this.submit())
			)
			.addButton((btn: ButtonComponent) =>
				btn.setButtonText('Cancel').onClick(() => this.close())
			);

		setTimeout(() => inputEl.focus(), 10);
	}

	private submit(): void {
		const displayProp = this.schema.displayProperty || 'title';
		const title = this.values[displayProp];
		if (!title || !String(title).trim()) return;
		this.close();
		this.onSubmit(this.values);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
