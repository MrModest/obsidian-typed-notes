import { App, TFile } from 'obsidian';

export class NoteIndex {
	private app: App;
	private index: Map<string, Set<string>> = new Map();

	constructor(app: App) {
		this.app = app;
	}

	buildInitialIndex(): void {
		this.index.clear();
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const typeId = cache?.frontmatter?.['type'] as string | undefined;
			if (typeId) {
				this.addToIndex(typeId, file.path);
			}
		}
	}

	getNotesOfType(typeId: string): TFile[] {
		const paths = this.index.get(typeId);
		if (!paths) return [];
		const files: TFile[] = [];
		for (const path of paths) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				files.push(file);
			}
		}
		return files;
	}

	getCount(typeId: string): number {
		return this.index.get(typeId)?.size ?? 0;
	}

	update(file: TFile, typeId: string | undefined): void {
		for (const [, paths] of this.index) {
			paths.delete(file.path);
		}
		if (typeId) {
			this.addToIndex(typeId, file.path);
		}
	}

	handleDelete(path: string): void {
		for (const [, paths] of this.index) {
			paths.delete(path);
		}
	}

	getAllTypedFiles(): Map<string, Set<string>> {
		return this.index;
	}

	private addToIndex(typeId: string, path: string): void {
		let paths = this.index.get(typeId);
		if (!paths) {
			paths = new Set();
			this.index.set(typeId, paths);
		}
		paths.add(path);
	}
}
