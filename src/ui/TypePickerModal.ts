import { App, SuggestModal, setIcon } from 'obsidian';
import { TypeSchema } from '../types';
import { NoteIndex } from '../notes/NoteIndex';

export class TypePickerModal extends SuggestModal<TypeSchema> {
	private schemas: TypeSchema[];
	private noteIndex: NoteIndex;
	private onChoose: (schema: TypeSchema) => void;

	constructor(
		app: App,
		schemas: TypeSchema[],
		noteIndex: NoteIndex,
		onChoose: (schema: TypeSchema) => void
	) {
		super(app);
		this.schemas = schemas;
		this.noteIndex = noteIndex;
		this.onChoose = onChoose;
	}

	getSuggestions(query: string): TypeSchema[] {
		const lower = query.toLowerCase();
		return this.schemas.filter((s) =>
			s.name.toLowerCase().includes(lower)
		);
	}

	renderSuggestion(schema: TypeSchema, el: HTMLElement): void {
		const container = el.createDiv({ cls: 'typed-notes-type-suggestion' });

		if (schema.icon) {
			const iconEl = container.createSpan({ cls: 'typed-notes-type-icon' });
			setIcon(iconEl, schema.icon);
		}

		const textEl = container.createDiv({ cls: 'typed-notes-type-text' });
		textEl.createDiv({ cls: 'typed-notes-type-name', text: schema.name });

		const propCount = schema.properties.length;
		const noteCount = this.noteIndex.getCount(schema.id);
		const hint = `${propCount} properties \u00B7 ${noteCount} notes`;
		textEl.createDiv({ cls: 'typed-notes-type-hint', text: hint });
	}

	onChooseSuggestion(schema: TypeSchema): void {
		this.onChoose(schema);
	}
}
