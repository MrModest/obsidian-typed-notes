import { App, TFile } from 'obsidian';

export class FrontmatterManager {
	constructor(private app: App) {}

	async updateProperty(file: TFile, key: string, value: unknown): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			frontmatter[key] = value;
		});
	}

	async renameProperty(file: TFile, oldKey: string, newKey: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			if (oldKey in frontmatter) {
				frontmatter[newKey] = frontmatter[oldKey];
				delete frontmatter[oldKey];
			}
		});
	}

	async removeProperty(file: TFile, key: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			delete frontmatter[key];
		});
	}

	async setProperties(file: TFile, properties: Record<string, unknown>): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			for (const [key, value] of Object.entries(properties)) {
				frontmatter[key] = value;
			}
		});
	}
}
