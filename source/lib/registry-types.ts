// Registry type and interface definitions

export interface SchemaProperty {
	type: string;
	description?: string;
	enum?: string[];
	items?: SchemaProperty;
	properties?: Record<string, SchemaProperty>;
	additionalProperties?: boolean | SchemaProperty;
	oneOf?: SchemaProperty[];
	if?: SchemaProperty | unknown;
	then?: SchemaProperty | unknown;
	else?: SchemaProperty | unknown;
}

export interface RegistrySchema {
	type?: string;
	$schema?: string;
	required?: string[];
	properties: Record<string, SchemaProperty>;
}

export interface RegistryFile {
	path: string;
	content?: string;
	type: RegistryType;
	target?: string;
}

export interface CSSVars {
	theme?: Record<string, string>;
	light?: Record<string, string>;
	dark?: Record<string, string>;
}

export type RegistryType =
	| 'registry:lib'
	| 'registry:block'
	| 'registry:component'
	| 'registry:ui'
	| 'registry:hook'
	| 'registry:theme'
	| 'registry:page'
	| 'registry:file'
	| 'registry:style';

export interface RegistryItem {
	name: string;
	type: RegistryType;
	description?: string;
	title?: string;
	author?: string;
	dependencies?: string[];
	devDependencies?: string[];
	registryDependencies?: string[];
	files?: RegistryFile[];
	cssVars?: CSSVars;
	css?: Record<string, unknown>;
	meta?: Record<string, unknown>;
	docs?: string;
	categories?: string[];
	extends?: string;
}

export interface PropertyDetail {
	name: string;
	type: string;
	description?: string;
	required: boolean;
	enum: string[] | null;
	items: SchemaProperty | null;
}

export interface SchemaInfo {
	schemaVersion: string;
	type: string;
	required: string[];
	properties: string[];
	propertyDetails: PropertyDetail[];
}

export interface ValidationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
}

export interface Change {
	field: string;
	from: unknown;
	to: unknown;
	type: 'modification';
}

export interface Addition {
	field: string;
	value: unknown;
	type: 'addition';
}

export interface Removal {
	field: string;
	value: unknown;
	type: 'removal';
}

export interface ValidationIssue {
	type: 'current' | 'result';
	issues: string[];
}

export interface ChangePlan {
	changes: Change[];
	additions: Addition[];
	removals: Removal[];
	validationIssues: ValidationIssue[];
	resultingItem: RegistryItem;
	summary: string;
}

export interface ValidatedItem {
	item: RegistryItem;
	validation: ValidationResult;
}

export interface ItemChangePlan {
	item: RegistryItem;
	plan: ChangePlan;
}

export interface SchemaProcessor {
	validate: (item: RegistryItem) => ValidationResult;
	planChanges: (
		currentItem: RegistryItem,
		desiredChanges: Partial<RegistryItem>,
	) => ChangePlan;
	getInfo: () => SchemaInfo;
	getTypes: () => RegistryType[];
	getFileTypes: () => RegistryType[];
	generateTemplate: (type?: RegistryType) => RegistryItem;
}

export interface RegistryIndex {
	[key: string]: {
		name: string;
		type: RegistryType;
		files: string[];
		dependencies?: string[];
		registryDependencies?: string[];
	};
}

export interface DependencyNode {
	name: string;
	item: RegistryItem;
	dependencies: DependencyNode[];
	registryDependencies: DependencyNode[];
	depth: number;
}

export interface DependencyTree {
	root: DependencyNode;
	allNodes: Map<string, DependencyNode>;
	flatDependencies: RegistryItem[];
}

export interface EnhancedSchemaProcessor extends SchemaProcessor {
	fetchItem: (name: string) => Promise<RegistryItem>;
	fetchItems: (names: string[]) => Promise<RegistryItem[]>;
	buildDependencyTree: (itemName: string) => Promise<DependencyTree>;
	getInstallationOrder: (itemName: string) => Promise<RegistryItem[]>;
	getAllDependencies: (itemName: string) => Promise<{
		registryDependencies: string[];
		npmDependencies: string[];
		allItems: RegistryItem[];
	}>;
	fetchIndex: () => Promise<RegistryIndex>;
} 