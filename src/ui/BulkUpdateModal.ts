import { App, Modal, Setting, ButtonComponent } from 'obsidian';
import { SchemaDiff } from '../types';

export class BulkUpdateModal extends Modal {
	private diff: SchemaDiff;
	private noteCount: number;
	private onConfirm: () => void;

	constructor(
		app: App,
		diff: SchemaDiff,
		noteCount: number,
		onConfirm: () => void
	) {
		super(app);
		this.diff = diff;
		this.noteCount = noteCount;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Confirm Bulk Update' });
		contentEl.createEl('p', {
			text: `This will modify ${this.noteCount} notes`,
		});

		if (this.diff.added.length > 0) {
			const section = contentEl.createDiv({
				cls: 'typed-notes-diff-added',
			});
			section.createEl('h4', { text: 'Added fields' });
			const list = section.createEl('ul');
			for (const prop of this.diff.added) {
				list.createEl('li', { text: prop.key });
			}
		}

		if (this.diff.removed.length > 0) {
			const section = contentEl.createDiv({
				cls: 'typed-notes-diff-removed',
			});
			section.createEl('h4', { text: 'Removed fields' });
			const list = section.createEl('ul');
			for (const key of this.diff.removed) {
				list.createEl('li', { text: key });
			}
		}

		if (this.diff.renamed.length > 0) {
			const section = contentEl.createDiv({
				cls: 'typed-notes-diff-renamed',
			});
			section.createEl('h4', { text: 'Renamed fields' });
			const list = section.createEl('ul');
			for (const r of this.diff.renamed) {
				list.createEl('li', { text: `${r.from} \u2192 ${r.to}` });
			}
		}

		if (this.diff.typeChanged.length > 0) {
			const section = contentEl.createDiv();
			section.createEl('h4', { text: 'Type changed' });
			const list = section.createEl('ul');
			for (const c of this.diff.typeChanged) {
				list.createEl('li', {
					text: `${c.key}: ${c.from} \u2192 ${c.to}`,
				});
			}
		}

		if (this.diff.defaultChanged.length > 0) {
			const section = contentEl.createDiv();
			section.createEl('h4', { text: 'Default changed' });
			const list = section.createEl('ul');
			for (const d of this.diff.defaultChanged) {
				list.createEl('li', {
					text: `${d.key}: new default = ${d.newDefault}`,
				});
			}
		}

		new Setting(contentEl)
			.addButton((btn: ButtonComponent) => {
				btn.setButtonText('Confirm').setCta().onClick(() => {
					this.onConfirm();
					this.close();
				});
			})
			.addButton((btn: ButtonComponent) => {
				btn.setButtonText('Cancel').onClick(() => {
					this.close();
				});
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
