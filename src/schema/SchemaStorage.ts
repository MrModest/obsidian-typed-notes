import { App, parseYaml, stringifyYaml } from 'obsidian';
import type { TypeSchema } from '../types';

export class SchemaStorage {
	private dir: string;

	constructor(private app: App) {
		this.dir = `${app.vault.configDir}/note-types`;
	}

	async ensureDir(): Promise<void> {
		const exists = await this.app.vault.adapter.exists(this.dir);
		if (!exists) {
			await this.app.vault.adapter.mkdir(this.dir);
		}
	}

	async loadAll(): Promise<TypeSchema[]> {
		await this.ensureDir();
		const listing = await this.app.vault.adapter.list(this.dir);
		const schemas: TypeSchema[] = [];

		for (const filePath of listing.files) {
			if (!filePath.endsWith('.yaml')) continue;
			try {
				const raw = await this.app.vault.adapter.read(filePath);
				const parsed = parseYaml(raw) as TypeSchema;
				if (parsed && parsed.id) {
					schemas.push(parsed);
				}
			} catch (e) {
				console.error(`[Typed Notes] Failed to load schema: ${filePath}`, e);
			}
		}

		return schemas;
	}

	async save(schema: TypeSchema): Promise<void> {
		await this.ensureDir();
		const filePath = `${this.dir}/${schema.id}.yaml`;
		const yaml = stringifyYaml(schema);
		await this.app.vault.adapter.write(filePath, yaml);
	}

	async delete(schemaId: string): Promise<void> {
		const filePath = `${this.dir}/${schemaId}.yaml`;
		const exists = await this.app.vault.adapter.exists(filePath);
		if (exists) {
			await this.app.vault.adapter.remove(filePath);
		}
	}
}
