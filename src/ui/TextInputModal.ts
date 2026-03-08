import { App, Modal, Setting } from 'obsidian';

export class TextInputModal extends Modal {
	private value = '';
	private prompt: string;
	private placeholder: string;
	private onSubmit: (value: string) => void;

	constructor(
		app: App,
		prompt: string,
		placeholder: string,
		onSubmit: (value: string) => void
	) {
		super(app);
		this.prompt = prompt;
		this.placeholder = placeholder;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('h3', { text: this.prompt });

		const inputEl = contentEl.createEl('input', {
			type: 'text',
			placeholder: this.placeholder,
			cls: 'typed-notes-text-input',
		});
		inputEl.addEventListener('input', () => {
			this.value = inputEl.value;
		});
		inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.submit();
			}
		});

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText('Create').setCta().onClick(() => this.submit())
			)
			.addButton((btn) =>
				btn.setButtonText('Cancel').onClick(() => this.close())
			);

		setTimeout(() => inputEl.focus(), 10);
	}

	private submit(): void {
		const trimmed = this.value.trim();
		if (!trimmed) return;
		this.close();
		this.onSubmit(trimmed);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
