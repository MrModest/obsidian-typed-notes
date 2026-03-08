import { App, Modal, Setting } from 'obsidian';

export class ConfirmModal extends Modal {
	private message: string;
	private onConfirm: () => void;

	constructor(app: App, message: string, onConfirm: () => void) {
		super(app);
		this.message = message;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('p', { text: this.message });

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText('Confirm').setWarning().onClick(() => {
					this.close();
					this.onConfirm();
				})
			)
			.addButton((btn) =>
				btn.setButtonText('Cancel').onClick(() => this.close())
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
