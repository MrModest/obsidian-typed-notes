import { App } from 'obsidian';
import type { TypeSchema, PropertyDefinition, PropertyType, SchemaDiff } from '../types';
import { SchemaStorage } from './SchemaStorage';

export class SchemaEngine {
	schemas: TypeSchema[] = [];
	private storage: SchemaStorage;

	constructor(private app: App) {
		this.storage = new SchemaStorage(app);
	}

	async loadSchemas(): Promise<void> {
		this.schemas = await this.storage.loadAll();
	}

	async saveSchema(schema: TypeSchema): Promise<void> {
		await this.storage.save(schema);
		const idx = this.schemas.findIndex((s) => s.id === schema.id);
		if (idx >= 0) {
			this.schemas[idx] = schema;
		} else {
			this.schemas.push(schema);
		}
	}

	async deleteSchema(schemaId: string): Promise<void> {
		await this.storage.delete(schemaId);
		this.schemas = this.schemas.filter((s) => s.id !== schemaId);
	}

	getSchema(id: string): TypeSchema | undefined {
		return this.schemas.find((s) => s.id === id);
	}

	diffSchemas(before: TypeSchema, after: TypeSchema): SchemaDiff {
		const beforeKeys = new Set(before.properties.map((p) => p.key));
		const afterKeys = new Set(after.properties.map((p) => p.key));

		const added: PropertyDefinition[] = [];
		const removed: string[] = [];
		const renamed: { from: string; to: string }[] = [];
		const typeChanged: { key: string; from: PropertyType; to: PropertyType }[] = [];
		const defaultChanged: { key: string; newDefault: unknown }[] = [];

		// Find removed keys (in before but not after) and added keys (in after but not before)
		const rawRemoved: string[] = [];
		const rawAdded: PropertyDefinition[] = [];

		for (const prop of before.properties) {
			if (!afterKeys.has(prop.key)) {
				rawRemoved.push(prop.key);
			}
		}

		for (const prop of after.properties) {
			if (!beforeKeys.has(prop.key)) {
				rawAdded.push(prop);
			}
		}

		// Position-based rename detection: match removed and added by position index
		// in their respective arrays. A rename is when a removed key at position i in
		// the before list corresponds to an added key at the same position in the after list,
		// and the non-key attributes are similar enough (same type).
		const beforeByKey = new Map(before.properties.map((p, i) => [p.key, i]));
		const afterByKey = new Map(after.properties.map((p, i) => [p.key, i]));

		const matchedRemoved = new Set<string>();
		const matchedAdded = new Set<string>();

		for (const removedKey of rawRemoved) {
			const beforeIdx = beforeByKey.get(removedKey);
			if (beforeIdx === undefined) continue;

			for (const addedProp of rawAdded) {
				if (matchedAdded.has(addedProp.key)) continue;

				const afterIdx = afterByKey.get(addedProp.key);
				if (afterIdx === undefined) continue;

				if (beforeIdx === afterIdx) {
					const beforeProp = before.properties[beforeIdx];
					if (beforeProp.type === addedProp.type) {
						renamed.push({ from: removedKey, to: addedProp.key });
						matchedRemoved.add(removedKey);
						matchedAdded.add(addedProp.key);
						break;
					}
				}
			}
		}

		// Remaining removed/added after rename matching
		for (const key of rawRemoved) {
			if (!matchedRemoved.has(key)) {
				removed.push(key);
			}
		}
		for (const prop of rawAdded) {
			if (!matchedAdded.has(prop.key)) {
				added.push(prop);
			}
		}

		// Detect type and default changes on keys present in both
		for (const afterProp of after.properties) {
			if (!beforeKeys.has(afterProp.key)) continue;
			const beforeProp = before.properties.find((p) => p.key === afterProp.key);
			if (!beforeProp) continue;

			if (beforeProp.type !== afterProp.type) {
				typeChanged.push({
					key: afterProp.key,
					from: beforeProp.type,
					to: afterProp.type,
				});
			}

			if (!defaultsEqual(beforeProp.default, afterProp.default)) {
				defaultChanged.push({
					key: afterProp.key,
					newDefault: afterProp.default,
				});
			}
		}

		return { added, removed, renamed, typeChanged, defaultChanged };
	}
}

function defaultsEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a === undefined && b === undefined) return true;
	if (a === null && b === null) return true;
	if (a == null || b == null) return false;
	return JSON.stringify(a) === JSON.stringify(b);
}
