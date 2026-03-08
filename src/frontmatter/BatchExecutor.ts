import { App, TFile } from 'obsidian';
import { BatchResult } from '../types';

export class BatchExecutor {
	constructor(private app: App) {}

	async execute(
		files: TFile[],
		operation: (frontmatter: Record<string, unknown>) => void,
		onProgress?: (completed: number, total: number) => void,
	): Promise<BatchResult> {
		const result: BatchResult = { succeeded: [], failed: [] };
		const total = files.length;

		for (let i = 0; i < total; i++) {
			const file = files[i];
			try {
				await this.app.fileManager.processFrontMatter(file, operation);
				result.succeeded.push(file);
			} catch (e) {
				result.failed.push({
					file,
					error: e instanceof Error ? e : new Error(String(e)),
				});
			}
			onProgress?.(i + 1, total);
		}

		return result;
	}
}
