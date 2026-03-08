export interface TypeSchema {
	/** Unique identifier, used in frontmatter `type: <id>` */
	id: string;
	/** Human-readable display name */
	name: string;
	/** Lucide icon name for visual distinction */
	icon?: string;
	/** Property key used as the displayed filename (e.g., 'title', 'name'). Defaults to 'title'. */
	displayProperty?: string;
	/** Ordered list of property definitions */
	properties: PropertyDefinition[];
}

export interface PropertyDefinition {
	/** Property key as it appears in YAML frontmatter */
	key: string;
	/** Display name shown in UI and Bases column headers */
	displayName?: string;
	/** Data type */
	type: PropertyType;
	/** Default value (used when creating new notes or backfilling) */
	default?: unknown;
	/** Whether the property is required (shown in validation) */
	required?: boolean;
	/** For 'select' / 'multiselect' types */
	options?: SelectOption[];
	/** For relation types — target type ID */
	relationType?: string;
	/** For relation types — single [[link]] or list of [[links]] */
	relationCardinality?: 'single' | 'multi';
	/** Column width hint for Bases table views */
	columnWidth?: number;
	/** Whether to hide this column from the default Bases view */
	hidden?: boolean;
}

export type PropertyType =
	| 'text'
	| 'number'
	| 'checkbox'
	| 'date'
	| 'datetime'
	| 'select'
	| 'multiselect'
	| 'tags'
	| 'url'
	| 'aliases'
	| 'relation'
	| 'list';

export const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
	{ value: 'text', label: 'Text' },
	{ value: 'number', label: 'Number' },
	{ value: 'checkbox', label: 'Checkbox' },
	{ value: 'date', label: 'Date' },
	{ value: 'datetime', label: 'Date & Time' },
	{ value: 'select', label: 'Select' },
	{ value: 'multiselect', label: 'Multi-select' },
	{ value: 'tags', label: 'Tags' },
	{ value: 'url', label: 'URL' },
	{ value: 'aliases', label: 'Aliases' },
	{ value: 'relation', label: 'Relation' },
	{ value: 'list', label: 'List' },
];

export interface SelectOption {
	value: string;
	/** Obsidian-style color, randomly assigned on creation */
	color?: string;
	/** Manual sort order */
	order: number;
}

export interface SchemaDiff {
	added: PropertyDefinition[];
	removed: string[];
	renamed: { from: string; to: string }[];
	typeChanged: { key: string; from: PropertyType; to: PropertyType }[];
	defaultChanged: { key: string; newDefault: unknown }[];
}

export interface BatchResult {
	succeeded: import('obsidian').TFile[];
	failed: { file: import('obsidian').TFile; error: Error }[];
}

export interface TypedNotesSettings {
	/** Root folder for ghost files */
	ghostRoot: string;
	/** Whether to append a slug suffix to ghost filenames */
	useSlugSuffix: boolean;
	/** Whether to move ghost files when they get body content */
	moveOnPromotion: boolean;
	/** Target folder when promoting ghost files */
	promotionTarget: string;
}

export const DEFAULT_SETTINGS: TypedNotesSettings = {
	ghostRoot: '_data',
	useSlugSuffix: true,
	moveOnPromotion: false,
	promotionTarget: '',
};
