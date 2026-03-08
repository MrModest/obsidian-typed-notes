import { AbstractInputSuggest, App, TFolder } from 'obsidian';

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
	}

	getSuggestions(query: string): TFolder[] {
		const lower = query.toLowerCase();
		const folders: TFolder[] = [];

		const walk = (folder: TFolder) => {
			if (folder.path && folder.path.toLowerCase().includes(lower)) {
				folders.push(folder);
			}
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					walk(child);
				}
			}
		};

		walk(this.app.vault.getRoot());
		return folders.slice(0, 50);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.setValue(folder.path);
		this.close();
	}
}
