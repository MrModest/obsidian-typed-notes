import { Setting, TextComponent, DropdownComponent } from 'obsidian';
import { PropertyDefinition } from '../types';

export function renderPropertyField(
	containerEl: HTMLElement,
	prop: PropertyDefinition,
	values: Record<string, unknown>,
): void {
	const label = prop.displayName || prop.key;

	switch (prop.type) {
		case 'checkbox': {
			new Setting(containerEl)
				.setName(label)
				.addToggle((toggle) => {
					toggle
						.setValue(values[prop.key] === true)
						.onChange((v) => {
							values[prop.key] = v;
						});
				});
			break;
		}

		case 'number': {
			new Setting(containerEl)
				.setName(label)
				.addText((text: TextComponent) => {
					text.inputEl.type = 'number';
					const val = values[prop.key];
					if (val != null) text.setValue(String(val));
					text.onChange((v) => {
						values[prop.key] = v ? Number(v) : undefined;
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
						const val = values[prop.key];
						if (val != null) dropdown.setValue(String(val));
						dropdown.onChange((v) => {
							values[prop.key] = v || undefined;
						});
					});
			} else {
				renderTextSetting(containerEl, label, prop, values);
			}
			break;
		}

		case 'date':
		case 'datetime': {
			new Setting(containerEl)
				.setName(label)
				.addText((text: TextComponent) => {
					text.inputEl.type = prop.type === 'date' ? 'date' : 'datetime-local';
					const val = values[prop.key];
					if (val != null) text.setValue(String(val));
					text.onChange((v) => {
						values[prop.key] = v || undefined;
					});
				});
			break;
		}

		case 'multiselect':
		case 'tags':
		case 'aliases':
		case 'list':
		case 'relation':
			// Skip complex types for now
			break;

		default: {
			renderTextSetting(containerEl, label, prop, values);
			break;
		}
	}
}

function renderTextSetting(
	containerEl: HTMLElement,
	label: string,
	prop: PropertyDefinition,
	values: Record<string, unknown>,
): void {
	new Setting(containerEl)
		.setName(label)
		.addText((text: TextComponent) => {
			const val = values[prop.key];
			if (val != null) text.setValue(String(val));
			text.onChange((v) => {
				values[prop.key] = v || undefined;
			});
		});
}
