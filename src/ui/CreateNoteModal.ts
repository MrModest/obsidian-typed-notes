import {
	App,
	Modal,
	Setting,
	TextComponent,
	DropdownComponent,
	ButtonComponent,
} from 'obsidian';
import { TypeSchema, PropertyDefinition } from '../types';

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

		// Pre-fill defaults
		for (const prop of schema.properties) {
			if (prop.default !== undefined) {
				this.values[prop.key] = prop.default;
			}
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: `New ${this.schema.name}` });

		const displayProp = this.schema.displayProperty || 'title';

		// Display property first (full-width, prominent)
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

		// Other properties
		for (const prop of this.schema.properties) {
			if (prop.key === displayProp) continue;
			this.renderPropertyField(contentEl, prop);
		}

		// Footer
		new Setting(contentEl)
			.addButton((btn: ButtonComponent) =>
				btn.setButtonText('Create').setCta().onClick(() => this.submit())
			)
			.addButton((btn: ButtonComponent) =>
				btn.setButtonText('Cancel').onClick(() => this.close())
			);

		setTimeout(() => inputEl.focus(), 10);
	}

	private renderPropertyField(containerEl: HTMLElement, prop: PropertyDefinition): void {
		const label = prop.displayName || prop.key;

		switch (prop.type) {
			case 'checkbox': {
				new Setting(containerEl)
					.setName(label)
					.addToggle((toggle) => {
						toggle
							.setValue(this.values[prop.key] === true)
							.onChange((v) => {
								this.values[prop.key] = v;
							});
					});
				break;
			}

			case 'number': {
				new Setting(containerEl)
					.setName(label)
					.addText((text: TextComponent) => {
						text.inputEl.type = 'number';
						const val = this.values[prop.key];
						if (val != null) text.setValue(String(val));
						text.onChange((v) => {
							this.values[prop.key] = v ? Number(v) : undefined;
						});
					});
				break;
			}

			case 'select': {
				if (prop.options && prop.options.length > 0) {
					new Setting(containerEl)
						.setName(label)
						.addDropdown((dropdown: DropdownComponent) => {
							dropdown.addOption('', '');
							for (const opt of prop.options!) {
								dropdown.addOption(opt.value, opt.value);
							}
							const val = this.values[prop.key];
							if (val != null) dropdown.setValue(String(val));
							dropdown.onChange((v) => {
								this.values[prop.key] = v || undefined;
							});
						});
				} else {
					this.renderTextSetting(containerEl, label, prop);
				}
				break;
			}

			case 'date':
			case 'datetime': {
				new Setting(containerEl)
					.setName(label)
					.addText((text: TextComponent) => {
						text.inputEl.type = prop.type === 'date' ? 'date' : 'datetime-local';
						const val = this.values[prop.key];
						if (val != null) text.setValue(String(val));
						text.onChange((v) => {
							this.values[prop.key] = v || undefined;
						});
					});
				break;
			}

			case 'multiselect':
			case 'tags':
			case 'aliases':
			case 'list':
			case 'relation':
				// Skip complex types in creation modal — user can fill them after
				break;

			default: {
				// text, url
				this.renderTextSetting(containerEl, label, prop);
				break;
			}
		}
	}

	private renderTextSetting(containerEl: HTMLElement, label: string, prop: PropertyDefinition): void {
		new Setting(containerEl)
			.setName(label)
			.addText((text: TextComponent) => {
				const val = this.values[prop.key];
				if (val != null) text.setValue(String(val));
				text.onChange((v) => {
					this.values[prop.key] = v || undefined;
				});
			});
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
