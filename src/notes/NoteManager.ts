import { App, TFile, TFolder, stringifyYaml, normalizePath } from 'obsidian';
import { TypeSchema, TypedNotesSettings, PropertyType } from '../types';
import { NoteIndex } from './NoteIndex';
import { formatTimestamp, slugify } from './naming';

export class NoteManager {
	private app: App;
	private settings: TypedNotesSettings;
	private noteIndex: NoteIndex;

	constructor(app: App, settings: TypedNotesSettings, noteIndex: NoteIndex) {
		this.app = app;
		this.settings = settings;
		this.noteIndex = noteIndex;
	}

	async createTypedNote(schema: TypeSchema, title: string, ghost: boolean): Promise<TFile> {
		const timestamp = formatTimestamp(new Date());
		const slug = this.settings.useSlugSuffix ? `-${slugify(title)}` : '';
		const filename = `${timestamp}${slug}.md`;

		let folder: string;
		if (ghost) {
			const subfolder = schema.folder || schema.id;
			folder = normalizePath(`${this.settings.ghostRoot}/${subfolder}`);
		} else {
			folder = '';
		}

		await this.ensureFolder(folder);

		const filePath = folder ? normalizePath(`${folder}/${filename}`) : filename;

		const frontmatter: Record<string, unknown> = { type: schema.id };
		const displayProperty = schema.displayProperty ?? 'title';

		for (const prop of schema.properties) {
			if (prop.key === displayProperty) {
				frontmatter[prop.key] = title;
			} else if (prop.default !== undefined) {
				frontmatter[prop.key] = prop.default;
			} else {
				frontmatter[prop.key] = this.getEmptyValue(prop.type);
			}
		}

		if (!frontmatter[displayProperty]) {
			frontmatter[displayProperty] = title;
		}

		const yaml = stringifyYaml(frontmatter);
		const content = ghost ? `---\n${yaml}---\n` : `---\n${yaml}---\n\n`;

		const file = await this.app.vault.create(filePath, content);
		this.noteIndex.update(file, schema.id);
		return file;
	}

	async checkGhostPromotion(file: TFile): Promise<void> {
		if (!this.settings.moveOnPromotion) return;

		const isGhost = await this.isGhostFile(file);
		if (isGhost) return;

		const ghostRoot = normalizePath(this.settings.ghostRoot);
		if (!file.path.startsWith(ghostRoot + '/')) return;

		const target = this.settings.promotionTarget || '';
		await this.ensureFolder(target);

		const newPath = target
			? normalizePath(`${target}/${file.name}`)
			: file.name;

		await this.app.fileManager.renameFile(file, newPath);
	}

	async isGhostFile(file: TFile): Promise<boolean> {
		const content = await this.app.vault.read(file);
		const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
		if (!match) return true;
		const body = match[1];
		return body.trim().length === 0;
	}

	getEmptyValue(type: PropertyType): unknown {
		switch (type) {
			case 'text':
			case 'url':
			case 'date':
			case 'datetime':
			case 'select':
				return '';
			case 'number':
				return 0;
			case 'checkbox':
				return false;
			case 'multiselect':
			case 'tags':
			case 'aliases':
			case 'list':
				return [];
			case 'relation':
				return '';
			default:
				return '';
		}
	}

	private async ensureFolder(folderPath: string): Promise<void> {
		if (!folderPath) return;
		const existing = this.app.vault.getAbstractFileByPath(folderPath);
		if (existing instanceof TFolder) return;

		const parts = folderPath.split('/');
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			const normalized = normalizePath(current);
			const folder = this.app.vault.getAbstractFileByPath(normalized);
			if (!folder) {
				await this.app.vault.createFolder(normalized);
			}
		}
	}
}
