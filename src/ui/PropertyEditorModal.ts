import {
	App,
	Modal,
	Setting,
	DropdownComponent,
	TextComponent,
	ButtonComponent,
} from 'obsidian';
import {
	PropertyDefinition,
	PropertyType,
	PROPERTY_TYPES,
	SelectOption,
} from '../types';

export class PropertyEditorModal extends Modal {
	private property: PropertyDefinition | null;
	private onSave: (property: PropertyDefinition) => void;

	private key = '';
	private displayName = '';
	private keyManuallyEdited = false;
	private type: PropertyType = 'text';
	private defaultValue: unknown = undefined;
	private required = false;
	private options: SelectOption[] = [];

	constructor(
		app: App,
		property: PropertyDefinition | null,
		onSave: (property: PropertyDefinition) => void
	) {
		super(app);
		this.property = property;
		this.onSave = onSave;

		if (property) {
			this.key = property.key;
			this.displayName = property.displayName ?? '';
			this.keyManuallyEdited = true;
			this.type = property.type;
			this.defaultValue = property.default;
			this.required = property.required ?? false;
			this.options = property.options ? [...property.options] : [];
		}
	}

	onOpen(): void {
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', {
			text: this.property ? 'Edit Property' : 'Add Property',
		});

		let keyInput: TextComponent;

		new Setting(contentEl)
			.setName('Display Name')
			.addText((text: TextComponent) => {
				text.setValue(this.displayName).onChange((v) => {
					this.displayName = v;
					if (!this.keyManuallyEdited) {
						this.key = v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
						keyInput.setValue(this.key);
					}
				});
			});

		new Setting(contentEl).setName('Key').addText((text: TextComponent) => {
			keyInput = text;
			text.setValue(this.key).onChange((v) => {
				this.key = v;
				this.keyManuallyEdited = true;
			});
		});

		new Setting(contentEl)
			.setName('Type')
			.addDropdown((dropdown: DropdownComponent) => {
				for (const pt of PROPERTY_TYPES) {
					dropdown.addOption(pt.value, pt.label);
				}
				dropdown.setValue(this.type).onChange((v) => {
					this.type = v as PropertyType;
					this.defaultValue = undefined;
					this.render();
				});
			});

		this.renderDefaultField(contentEl);

		new Setting(contentEl)
			.setName('Required')
			.addToggle((toggle) => {
				toggle.setValue(this.required).onChange(
					(v) => (this.required = v)
				);
			});

		this.renderOptions(contentEl);

		new Setting(contentEl).addButton((btn: ButtonComponent) => {
			btn.setButtonText('Save')
				.setCta()
				.onClick(() => {
					if (!this.key.trim()) return;
					const def: PropertyDefinition = {
						key: this.key.trim(),
						type: this.type,
					};
					if (this.displayName.trim()) {
						def.displayName = this.displayName.trim();
					}
					if (this.defaultValue !== undefined && this.defaultValue !== '' && this.defaultValue !== false) {
						def.default = this.defaultValue;
					}
					if (this.required) {
						def.required = true;
					}
					if (
						(this.type === 'select' || this.type === 'multiselect') &&
						this.options.length > 0
					) {
						def.options = [...this.options];
					}
					this.onSave(def);
					this.close();
				});
		});
	}

	private renderDefaultField(contentEl: HTMLElement): void {
		switch (this.type) {
			case 'checkbox': {
				const val = this.defaultValue === true;
				new Setting(contentEl)
					.setName('Default Value')
					.addToggle((toggle) => {
						toggle.setValue(val).onChange((v) => {
							this.defaultValue = v;
						});
					});
				break;
			}

			case 'number': {
				const val = this.defaultValue != null ? String(this.defaultValue) : '';
				new Setting(contentEl)
					.setName('Default Value')
					.addText((text: TextComponent) => {
						text.inputEl.type = 'number';
						text.setValue(val).onChange((v) => {
							this.defaultValue = v ? Number(v) : undefined;
						});
					});
				break;
			}

			case 'select': {
				const val = this.defaultValue != null ? String(this.defaultValue) : '';
				if (this.options.length > 0) {
					new Setting(contentEl)
						.setName('Default Value')
						.addDropdown((dropdown: DropdownComponent) => {
							dropdown.addOption('', '(none)');
							for (const opt of this.options) {
								dropdown.addOption(opt.value, opt.value);
							}
							dropdown.setValue(val).onChange((v) => {
								this.defaultValue = v || undefined;
							});
						});
				} else {
					new Setting(contentEl)
						.setName('Default Value')
						.addText((text: TextComponent) => {
							text.setPlaceholder('Add options first or type a value')
								.setValue(val)
								.onChange((v) => {
									this.defaultValue = v || undefined;
								});
						});
				}
				break;
			}

			case 'date':
			case 'datetime': {
				const val = this.defaultValue != null ? String(this.defaultValue) : '';
				new Setting(contentEl)
					.setName('Default Value')
					.addText((text: TextComponent) => {
						text.inputEl.type = this.type === 'date' ? 'date' : 'datetime-local';
						text.setValue(val).onChange((v) => {
							this.defaultValue = v || undefined;
						});
					});
				break;
			}

			case 'multiselect':
			case 'tags':
			case 'aliases':
			case 'list':
				// List types: no default value field (too complex for a simple input)
				break;

			case 'relation':
				// Relation defaults don't make sense
				break;

			default: {
				// text, url
				const val = this.defaultValue != null ? String(this.defaultValue) : '';
				new Setting(contentEl)
					.setName('Default Value')
					.addText((text: TextComponent) => {
						text.setValue(val).onChange((v) => {
							this.defaultValue = v || undefined;
						});
					});
				break;
			}
		}
	}

	private renderOptions(contentEl: HTMLElement): void {
		if (this.type !== 'select' && this.type !== 'multiselect') return;

		const section = contentEl.createDiv({
			cls: 'typed-notes-options-section',
		});
		section.createEl('h4', { text: 'Options' });

		for (let i = 0; i < this.options.length; i++) {
			const opt = this.options[i];
			new Setting(section)
				.setName(opt.value)
				.addButton((btn: ButtonComponent) => {
					btn.setButtonText('Remove')
						.setWarning()
						.onClick(() => {
							this.options.splice(i, 1);
							this.render();
						});
				});
		}

		new Setting(section).addText((text: TextComponent) => {
			text.setPlaceholder('New option value');
			text.inputEl.dataset['optionInput'] = 'true';
		}).addButton((btn: ButtonComponent) => {
			btn.setButtonText('Add').onClick(() => {
				const input = section.querySelector(
					'[data-option-input="true"]'
				) as HTMLInputElement | null;
				const val = input?.value?.trim();
				if (val) {
					this.options.push({
						value: val,
						order: this.options.length,
					});
					this.render();
				}
			});
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
