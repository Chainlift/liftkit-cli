// Registry utility functions - simplified for createSchemaProcessor usage

import type {
  RegistryItem,
  RegistrySchema,
  RegistryType,
  SchemaProperty,
} from './registry-types.js';

// Core type guards
const isArray = (val: unknown): val is unknown[] => Array.isArray(val);
const isObject = (val: unknown): val is Record<string, unknown> =>
  val !== null && typeof val === 'object' && !isArray(val);
const isString = (val: unknown): val is string => typeof val === 'string';

// Schema analysis functions
const extractPropertyNames = (schema: RegistrySchema): string[] =>
  Object.keys(schema.properties);

const extractRequired = (schema: RegistrySchema): string[] =>
  schema.required?.map((key: string) => key) || [];

const extractPropertyDetails = (
  schema: RegistrySchema,
): Array<{
  name: string;
  type: string;
  description?: string;
  required: boolean;
  enum: string[] | null;
  items: SchemaProperty | null;
}> => {
  const keys = Object.keys(schema.properties);
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

const getSchemaInfo = (
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

// Field validation
const createFieldValidator = (
  schema: RegistrySchema,
  fieldName: string,
  value: unknown,
): string[] => {
  if (
    fieldName.startsWith('$') ||
    ['$schema', '$id', '$ref', 'metadata', 'meta'].includes(fieldName)
  ) {
    return [];
  }

  const fieldSchema = schema.properties[fieldName];
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
      } else if (fieldSchema.items?.type === 'string') {
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
  }

  if (fieldSchema.enum && !fieldSchema.enum.includes(value as string)) {
    errors.push(
      `Field '${fieldName}' must be one of: ${fieldSchema.enum.join(', ')}`,
    );
  }

  return errors;
};

// Item validation
const validateRequiredFields = (
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

const validateFieldTypes = (
  schema: RegistrySchema,
  item: RegistryItem,
): string[] => {
  const errors: string[] = [];
  const schemaFields = extractPropertyNames(schema);

  for (const field of schemaFields) {
    if (field in item) {
      const fieldErrors = createFieldValidator(
        schema,
        field,
        item[field as keyof RegistryItem],
      );
      errors.push(...fieldErrors);
    }
  }
  return errors;
};

const findUnknownFields = (
  schema: RegistrySchema,
  item: RegistryItem,
): string[] => {
  const validFields = extractPropertyNames(schema);
  const keys = Object.keys(item);
  return keys
    .filter(key => {
      if (key === 'name' || key === 'type') return false;
      return !validFields.includes(key);
    })
    .map(key => `Unknown field: ${key}`);
};

const validateRegistryItem = (
  schema: RegistrySchema,
  item: RegistryItem,
): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} => {
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

// Change planning
const findModifications = (
  current: Record<string, unknown>,
  desired: Record<string, unknown>,
): Array<{
  field: string;
  from: unknown;
  to: unknown;
  type: 'modification';
}> => {
  const changes: Array<{
    field: string;
    from: unknown;
    to: unknown;
    type: 'modification';
  }> = [];
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
        type: 'modification',
      });
    }
  }
  return changes;
};

const findAdditions = (
  current: Record<string, unknown>,
  desired: Record<string, unknown>,
): Array<{
  field: string;
  value: unknown;
  type: 'addition';
}> => {
  const additions: Array<{
    field: string;
    value: unknown;
    type: 'addition';
  }> = [];
  for (const key in desired) {
    if (
      Object.prototype.hasOwnProperty.call(desired, key) &&
      !Object.prototype.hasOwnProperty.call(current, key)
    ) {
      additions.push({
        field: key,
        value: desired[key],
        type: 'addition',
      });
    }
  }
  return additions;
};

const findRemovals = (
  current: Record<string, unknown>,
  desired: Record<string, unknown>,
): Array<{
  field: string;
  value: unknown;
  type: 'removal';
}> => {
  const removals: Array<{
    field: string;
    value: unknown;
    type: 'removal';
  }> = [];
  for (const key in current) {
    if (
      Object.prototype.hasOwnProperty.call(current, key) &&
      !Object.prototype.hasOwnProperty.call(desired, key)
    ) {
      removals.push({
        field: key,
        value: current[key],
        type: 'removal',
      });
    }
  }
  return removals;
};

const applyChanges = (
  current: Record<string, unknown>,
  desired: Record<string, unknown>,
  removals: Array<{field: string}>,
): Record<string, unknown> => {
  const result = {...current, ...desired};
  for (const removal of removals) {
    delete result[removal.field];
  }
  return result;
};

// Change summary formatting
const formatChange = (change: {
  field: string;
  from: unknown;
  to: unknown;
}): string => `Modified ${change.field}: ${change.from} → ${change.to}`;

const formatAddition = (addition: {field: string; value: unknown}): string =>
  `Added ${addition.field}: ${addition.value}`;

const formatRemoval = (removal: {field: string}): string =>
  `Removed ${removal.field}`;

const formatValidationIssue = (issue: {
  type: string;
  issues: string[];
}): string => `${issue.type} validation issues: ${issue.issues.join(', ')}`;

const generateChangeSummary = (plan: {
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

const createChangePlan = (
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

  const validResultingItem: RegistryItem = {
    name: (resultingItem['name'] as string) || current.name,
    type: (resultingItem['type'] as RegistryType) || current.type,
    ...resultingItem,
  };

  const validation = validateRegistryItem(schema, validResultingItem);
  let validationIssues: Array<{type: 'result'; issues: string[]}>;
  if (validation.errors.length > 0) {
    validationIssues = [{type: 'result', issues: validation.errors}];
  } else {
    validationIssues = [];
  }

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

// Template generation
const getTypeDefaults = (type: string): Record<string, unknown> => {
  const defaults: Record<string, Record<string, unknown>> = {
    'registry:component': {
      dependencies: [],
      files: [],
    },
  };
  return defaults[type] || {};
};

const generateTemplate = (type: RegistryType): RegistryItem => ({
  name: '',
  type,
  files: [],
  ...getTypeDefaults(type),
});

// Schema type extraction
const getRegistryTypes = (schema: RegistrySchema): string[] =>
  schema.properties['type']?.enum || [];

const getFileTypes = (schema: RegistrySchema): string[] =>
  schema.properties['files']?.items?.properties?.['type']?.enum || [];

// Main export - the only function used externally
export const createSchemaProcessor = (schema: RegistrySchema) => ({
  validate: (item: RegistryItem) => validateRegistryItem(schema, item),
  planChanges: (
    currentItem: RegistryItem,
    desiredChanges: Partial<RegistryItem>,
  ) =>
    createChangePlan(schema, currentItem, {...currentItem, ...desiredChanges}),
  generateTemplate: (type?: RegistryType) =>
    generateTemplate(type || 'registry:component'),
  getSchemaInfo: () => getSchemaInfo(schema),
  getInfo: () => getSchemaInfo(schema),
  getTypes: () => getRegistryTypes(schema) as RegistryType[],
  getFileTypes: () => getFileTypes(schema) as RegistryType[],
});
