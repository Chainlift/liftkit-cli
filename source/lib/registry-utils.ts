// Registry utility functions

import type {
	RegistryItem,
	RegistrySchema,
	SchemaProperty,
	RegistryType,
} from './registry-types.js';

// Remove typedEntries and typedKeys helpers

export function pipe<T, R>(
	...fns: Array<(value: T) => T | R>
): (value: T) => R {
	return (value: T): R =>
		fns.reduce(
			(acc: T | R, fn: (value: T) => T | R) => fn(acc as T),
			value,
		) as R;
}

export function curry<T extends unknown[], R>(
	fn: (...args: T) => R,
): (...args: T) => R | ((...args: unknown[]) => unknown) {
	return function curried(...args: T): R | ((...args: unknown[]) => unknown) {
		if (args.length >= fn.length) {
			return fn(...args);
		} else {
			return (...next: unknown[]): unknown =>
				curried(...([...args, ...next] as T));
		}
	};
}

// Refactor 'has' to avoid direct use of Object.prototype.hasOwnProperty from the target object
export const has = <T extends object>(key: PropertyKey, obj: T): boolean =>
	Object.prototype.hasOwnProperty.call(obj, key);

export const isArray = (val: unknown): val is unknown[] => Array.isArray(val);

export const isObject = (val: unknown): val is Record<string, unknown> =>
	val !== null && typeof val === 'object' && !isArray(val);

export const isString = (val: unknown): val is string =>
	typeof val === 'string';

// --- Validation and planning functions ---

export const extractPropertyNames = (schema: RegistrySchema): string[] => {
	return Object.keys(schema.properties) as Array<
		keyof typeof schema.properties
	> as string[];
};

export const extractRequired = (schema: RegistrySchema): string[] =>
	schema.required ? schema.required.map((key: string) => key) : [];

export const extractPropertyDetails = (
	schema: RegistrySchema,
): Array<{
	name: string;
	type: string;
	description?: string;
	required: boolean;
	enum: string[] | null;
	items: SchemaProperty | null;
}> => {
	const keys = Object.keys(schema.properties) as Array<
		keyof typeof schema.properties
	>;
	return keys.map(key => {
		const details = schema.properties[key];
		return {
			name: String(key),
			type: details?.type || 'unknown',
			description: details?.description,
			required: extractRequired(schema).includes(String(key)),
			enum: details?.enum || null,
			items: details?.items || null,
		};
	});
};

export const getSchemaInfo = (
	schema: RegistrySchema,
): {
	schemaVersion: string;
	type: string;
	required: string[];
	properties: string[];
	propertyDetails: Array<{
		name: string;
		type: string;
		description?: string;
		required: boolean;
		enum: string[] | null;
		items: SchemaProperty | null;
	}>;
} => ({
	schemaVersion: schema.$schema || 'http://json-schema.org/draft-07/schema#',
	type: schema.type || 'object',
	required: extractRequired(schema),
	properties: extractPropertyNames(schema),
	propertyDetails: extractPropertyDetails(schema),
});

export const createFieldValidator = (
	schema: RegistrySchema,
	fieldName: string,
	value: unknown,
): string[] => {
	switch (true) {
		case fieldName.startsWith('$'):
			return [];
		case ['$schema', '$id', '$ref', 'metadata', 'meta'].includes(fieldName):
			return [];
		default:
			break; // intentional fallthrough
	}
	const fieldSchema =
		schema.properties[fieldName as keyof typeof schema.properties];
	if (!fieldSchema) {
		return [`Unknown field: ${fieldName}`];
	}
	const errors: string[] = [];
	switch (fieldSchema.type) {
		case 'string':
			if (!isString(value)) {
				errors.push(`Field '${fieldName}' must be a string`);
			}
			break;
		case 'array':
			if (!isArray(value)) {
				errors.push(`Field '${fieldName}' must be an array`);
			} else if (fieldSchema.items && fieldSchema.items.type === 'string') {
				// Validate array items
				(value as unknown[]).forEach((item: unknown, index: number) => {
					if (!isString(item)) {
						errors.push(
							`Array item at index ${index} in field '${fieldName}' must be a string`,
						);
					}
				});
			}
			break;
		case 'object':
			if (!isObject(value)) {
				errors.push(`Field '${fieldName}' must be an object`);
			}
			break;
		default:
			break; // intentional fallthrough
	}
	if (fieldSchema.enum && !fieldSchema.enum.includes(value as string)) {
		errors.push(
			`Field '${fieldName}' must be one of: ${fieldSchema.enum.join(', ')}`,
		);
	}
	return errors;
};

export const validateRequiredFields = (
	schema: RegistrySchema,
	item: RegistryItem,
): string[] => {
	const required = extractRequired(schema);
	const errors: string[] = [];

	for (const field of required) {
		if (!(field in item)) {
			errors.push(`Missing required field: ${field}`);
		}
	}

	return errors;
};

// Additional validation functions
export const validateFieldTypes = (
	schema: RegistrySchema,
	item: RegistryItem,
): string[] => {
	const errors: string[] = [];
	const schemaFields = extractPropertyNames(schema);

	// Only validate fields that are defined in the schema
	for (const field of schemaFields) {
		if (field in item) {
			const fieldErrors = createFieldValidator(
				schema,
				field,
				item[field as keyof RegistryItem],
			);
			if (Array.isArray(fieldErrors)) {
				errors.push(...fieldErrors);
			}
		}
	}
	return errors;
};

export const findUnknownFields = (
	schema: RegistrySchema,
	item: RegistryItem,
): string[] => {
	const validFields = extractPropertyNames(schema);
	const keys = Object.keys(item) as Array<keyof RegistryItem>;
	return keys
		.filter(key => {
			const keyStr = String(key);
			// Always allow 'name' and 'type' fields as they are required in RegistryItem
			if (keyStr === 'name' || keyStr === 'type') {
				return false;
			}
			return !validFields.includes(keyStr);
		})
		.map(key => `Unknown field: ${String(key)}`);
};

export const validateRegistryItem = (
	schema: RegistrySchema,
	item: RegistryItem,
): {isValid: boolean; errors: string[]; warnings: string[]} => {
	const requiredErrors = validateRequiredFields(schema, item);
	const typeErrors = validateFieldTypes(schema, item);
	const warnings = findUnknownFields(schema, item);
	const errors = [...requiredErrors, ...typeErrors];

	return {
		isValid: errors.length === 0,
		errors,
		warnings,
	};
};

// Change planning functions
export const findModifications = (
	current: Record<string, unknown>,
	desired: Record<string, unknown>,
): Array<{field: string; from: unknown; to: unknown; type: 'modification'}> => {
	const changes = [];
	for (const key in desired) {
		if (
			Object.prototype.hasOwnProperty.call(desired, key) &&
			Object.prototype.hasOwnProperty.call(current, key) &&
			current[key] !== desired[key]
		) {
			changes.push({
				field: key,
				from: current[key],
				to: desired[key],
				type: 'modification' as const,
			});
		}
	}
	return changes;
};

export const findAdditions = (
	current: Record<string, unknown>,
	desired: Record<string, unknown>,
): Array<{field: string; value: unknown; type: 'addition'}> => {
	const additions = [];
	for (const key in desired) {
		if (
			Object.prototype.hasOwnProperty.call(desired, key) &&
			!Object.prototype.hasOwnProperty.call(current, key)
		) {
			additions.push({
				field: key,
				value: desired[key],
				type: 'addition' as const,
			});
		}
	}
	return additions;
};

export const findRemovals = (
	current: Record<string, unknown>,
	desired: Record<string, unknown>,
): Array<{field: string; value: unknown; type: 'removal'}> => {
	const removals = [];
	for (const key in current) {
		if (
			Object.prototype.hasOwnProperty.call(current, key) &&
			!Object.prototype.hasOwnProperty.call(desired, key)
		) {
			removals.push({
				field: key,
				value: current[key],
				type: 'removal' as const,
			});
		}
	}
	return removals;
};

export const applyChanges = (
	current: Record<string, unknown>,
	desired: Record<string, unknown>,
	removals: Array<{field: string}>,
) => {
	const result = {...current, ...desired};
	for (const removal of removals) {
		delete result[removal.field];
	}
	return result;
};

export const createChangePlan = (
	schema: RegistrySchema,
	current: RegistryItem,
	desired: RegistryItem,
) => {
	const changes = findModifications(
		current as unknown as Record<string, unknown>,
		desired as unknown as Record<string, unknown>,
	);
	const additions = findAdditions(
		current as unknown as Record<string, unknown>,
		desired as unknown as Record<string, unknown>,
	);
	const removals = findRemovals(
		current as unknown as Record<string, unknown>,
		desired as unknown as Record<string, unknown>,
	);
	const resultingItem = applyChanges(
		current as unknown as Record<string, unknown>,
		desired as unknown as Record<string, unknown>,
		removals,
	);

	// Ensure the resulting item has the required name and type properties
	const validResultingItem: RegistryItem = {
		name: (resultingItem['name'] as string) || (current.name as string),
		type:
			(resultingItem['type'] as RegistryType) || (current.type as RegistryType),
		...resultingItem,
	};

	const validation = validateRegistryItem(schema, validResultingItem);

	const validationIssues: {type: 'current' | 'result'; issues: string[]}[] =
		validation.errors.length > 0
			? [{type: 'result', issues: validation.errors}]
			: [];

	return {
		changes,
		additions,
		removals,
		validationIssues,
		resultingItem: validResultingItem,
		summary: generateChangeSummary({
			changes,
			additions,
			removals,
			validationIssues,
		}),
	};
};

// Formatting functions
export const formatChange = (change: {
	field: string;
	from: unknown;
	to: unknown;
}): string => {
	return `Modified ${change.field}: ${change.from} → ${change.to}`;
};

export const formatAddition = (addition: {
	field: string;
	value: unknown;
}): string => {
	return `Added ${addition.field}: ${addition.value}`;
};

export const formatRemoval = (removal: {field: string}): string => {
	return `Removed ${removal.field}`;
};

export const formatValidationIssue = (issue: {
	type: string;
	issues: string[];
}): string => {
	return `${issue.type} validation issues: ${issue.issues.join(', ')}`;
};

export const generateChangeSummary = (plan: {
	changes: Array<{field: string; from: unknown; to: unknown}>;
	additions: Array<{field: string; value: unknown}>;
	removals: Array<{field: string; value: unknown}>;
	validationIssues: Array<{type: string; issues: string[]}>;
}): string => {
	const sections: string[] = [];

	if (plan.changes.length > 0) {
		sections.push(`modified: ${plan.changes.map(formatChange).join(', ')}`);
	}

	if (plan.additions.length > 0) {
		sections.push(`added: ${plan.additions.map(formatAddition).join(', ')}`);
	}

	if (plan.removals.length > 0) {
		sections.push(`removed: ${plan.removals.map(formatRemoval).join(', ')}`);
	}

	if (plan.validationIssues.length > 0) {
		sections.push(
			`Validation issues: ${plan.validationIssues
				.map(formatValidationIssue)
				.join(', ')}`,
		);
	}

	return sections.join('\n');
};

// Utility functions
export const getTypeDefaults = (type: string): Record<string, unknown> => {
	const defaults: Record<string, Record<string, unknown>> = {
		'registry:component': {
			dependencies: [],
			files: [],
		},
	};

	return defaults[type] || {};
};

export const generateTemplate = (type: RegistryType) => {
	return {
		name: '',
		type,
		files: [],
		...getTypeDefaults(type),
	};
};

export const getRegistryTypes = (schema: RegistrySchema): string[] => {
	const typeProperty = schema.properties['type'];
	return typeProperty?.enum || [];
};

export const getFileTypes = (schema: RegistrySchema): string[] => {
	const filesProperty = schema.properties['files'];
	if (filesProperty?.items?.properties?.['type']?.enum) {
		return filesProperty.items.properties['type'].enum;
	}
	return [];
};

export const validateItems = (
	schema: RegistrySchema,
	items: RegistryItem[],
): Array<{
	item: RegistryItem;
	validation: {isValid: boolean; errors: string[]; warnings: string[]};
}> => {
	return items.map(item => ({
		item,
		validation: validateRegistryItem(schema, item),
	}));
};

export const planChangesForItems = (
	schema: RegistrySchema,
	changeMap: Record<string, Record<string, unknown>>,
	items: RegistryItem[],
): Array<{item: RegistryItem; plan: ReturnType<typeof createChangePlan>}> => {
	return items.map(item => {
		const name = item.name as string;
		const desired = changeMap[name] || {};
		return {
			item,
			plan: createChangePlan(schema, item, {...item, ...desired}),
		};
	});
};

export const createSchemaProcessor = (schema: RegistrySchema) => {
	return {
		validate: (item: RegistryItem) => validateRegistryItem(schema, item),
		planChanges: (
			currentItem: RegistryItem,
			desiredChanges: Partial<RegistryItem>,
		) =>
			createChangePlan(schema, currentItem, {
				...currentItem,
				...desiredChanges,
			}),
		generateTemplate: (type?: RegistryType) =>
			generateTemplate(type ?? 'registry:component'),
		getSchemaInfo: () => getSchemaInfo(schema),
		getInfo: () => getSchemaInfo(schema),
		getTypes: () => getRegistryTypes(schema) as RegistryType[],
		getFileTypes: () => getFileTypes(schema) as RegistryType[],
	};
};
