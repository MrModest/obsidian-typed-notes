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
	private type: PropertyType = 'text';
	private defaultValue = '';
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
			this.type = property.type;
			this.defaultValue =
				property.default != null ? String(property.default) : '';
			this.required = property.required ?? false;
			this.options = property.options ? [...property.options] : [];
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', {
			text: this.property ? 'Edit Property' : 'Add Property',
		});

		new Setting(contentEl).setName('Key').addText((text: TextComponent) => {
			text.setValue(this.key).onChange((v) => (this.key = v));
		});

		new Setting(contentEl)
			.setName('Display Name')
			.addText((text: TextComponent) => {
				text.setValue(this.displayName).onChange(
					(v) => (this.displayName = v)
				);
			});

		new Setting(contentEl)
			.setName('Type')
			.addDropdown((dropdown: DropdownComponent) => {
				for (const pt of PROPERTY_TYPES) {
					dropdown.addOption(pt.value, pt.label);
				}
				dropdown.setValue(this.type).onChange((v) => {
					this.type = v as PropertyType;
					this.renderOptions(contentEl);
				});
			});

		new Setting(contentEl)
			.setName('Default Value')
			.addText((text: TextComponent) => {
				text.setValue(this.defaultValue).onChange(
					(v) => (this.defaultValue = v)
				);
			});

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
					if (!this.key.trim()) {
						return;
					}
					const def: PropertyDefinition = {
						key: this.key.trim(),
						type: this.type,
					};
					if (this.displayName.trim()) {
						def.displayName = this.displayName.trim();
					}
					if (this.defaultValue.trim()) {
						def.default = this.defaultValue.trim();
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

	private renderOptions(contentEl: HTMLElement): void {
		const existing = contentEl.querySelector(
			'.typed-notes-options-section'
		);
		if (existing) existing.remove();

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
							this.renderOptions(contentEl);
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
					this.renderOptions(contentEl);
				}
			});
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
