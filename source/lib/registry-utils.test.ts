import {describe, it, expect} from 'vitest';
import {createSchemaProcessor} from './registry-utils.js';
import type {RegistrySchema, RegistryItem} from './registry-types.js';

// Mock schema for testing
const mockSchema: RegistrySchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'The name of the component',
    },
    type: {
      type: 'string',
      enum: ['registry:component', 'registry:block', 'registry:hook'],
      description: 'The type of the registry item',
    },
    description: {
      type: 'string',
      description: 'A description of the component',
    },
    dependencies: {
      type: 'array',
      items: {
        type: 'string',
      },
      description: 'List of dependencies',
    },
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: {type: 'string'},
          type: {
            type: 'string',
            enum: ['registry:ui', 'registry:component', 'registry:lib'],
          },
        },
      },
      description: 'List of files',
    },
    tags: {
      type: 'array',
      items: {
        type: 'string',
      },
      description: 'Tags for categorization',
    },
  },
  required: ['name', 'type'],
};

const validRegistryItem: RegistryItem = {
  name: 'test-component',
  type: 'registry:component',
  description: 'A test component',
  dependencies: ['react'],
  files: [
    {
      path: './components/test.tsx',
      type: 'registry:ui',
    },
  ],
  // Note: Removed tags since it's not in RegistryItem type
};

describe('createSchemaProcessor', (): void => {
  const processor = createSchemaProcessor(mockSchema);

  describe('validate', (): void => {
    it('should validate a correct registry item', (): void => {
      const result = processor.validate(validRegistryItem);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should return errors for missing required fields', (): void => {
      const invalidItem = {
        description: 'Missing name and type',
      } as RegistryItem;

      const result = processor.validate(invalidItem);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required field: name');
      expect(result.errors).toContain('Missing required field: type');
    });

    it('should return errors for invalid field types', (): void => {
      const invalidItem = {
        name: 123, // Should be string
        type: 'registry:component',
        dependencies: 'not-an-array', // Should be array
      } as unknown as RegistryItem;

      const result = processor.validate(invalidItem);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Field 'name' must be a string");
      expect(result.errors).toContain("Field 'dependencies' must be an array");
    });

    it('should return errors for invalid enum values', (): void => {
      const invalidItem = {
        name: 'test',
        type: 'invalid-type', // Not in enum
      } as unknown as RegistryItem;

      const result = processor.validate(invalidItem);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Field 'type' must be one of: registry:component, registry:block, registry:hook",
      );
    });

    it('should return warnings for unknown fields', (): void => {
      const itemWithUnknownField = {
        ...validRegistryItem,
        unknownField: 'some value',
      } as RegistryItem & {unknownField: string};

      const result = processor.validate(itemWithUnknownField);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Unknown field: unknownField');
    });

    it('should validate array items correctly', (): void => {
      const invalidItem = {
        name: 'test',
        type: 'registry:component',
        dependencies: ['valid-string', 123, 'another-valid'], // Mixed types
      } as unknown as RegistryItem;

      const result = processor.validate(invalidItem);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Array item at index 1 in field 'dependencies' must be a string",
      );
    });
  });

  describe('planChanges', (): void => {
    it('should detect modifications', (): void => {
      const current: RegistryItem = {
        name: 'test',
        type: 'registry:component',
        description: 'Old description',
      };

      const desired = {description: 'New description'};
      const plan = processor.planChanges(current, desired);

      expect(plan.changes).toHaveLength(1);
      expect(plan.changes[0]).toEqual({
        field: 'description',
        from: 'Old description',
        to: 'New description',
        type: 'modification',
      });
    });

    it('should detect additions', (): void => {
      const current: RegistryItem = {
        name: 'test',
        type: 'registry:component',
      };

      // Using dependencies instead of tags since tags isn't in RegistryItem type
      const desired = {dependencies: ['new', 'deps']};
      const plan = processor.planChanges(current, desired);

      expect(plan.additions).toHaveLength(1);
      expect(plan.additions[0]).toEqual({
        field: 'dependencies',
        value: ['new', 'deps'],
        type: 'addition',
      });
    });

    it('should not detect removals with partial changes', (): void => {
      // The planChanges method merges partial changes, so it doesn't remove fields
      const current: RegistryItem = {
        name: 'test',
        type: 'registry:component',
        description: 'Will stay',
        dependencies: ['old', 'deps'],
      };

      const desired = {dependencies: ['new', 'deps']}; // Only changing dependencies
      const plan = processor.planChanges(current, desired);

      // No removals because planChanges merges with current item
      expect(plan.removals).toHaveLength(0);
      expect(plan.changes).toHaveLength(1);
      expect(plan.changes[0]).toEqual({
        field: 'dependencies',
        from: ['old', 'deps'],
        to: ['new', 'deps'],
        type: 'modification',
      });
    });

    it('should generate a proper summary', (): void => {
      const current: RegistryItem = {
        name: 'test',
        type: 'registry:component',
        description: 'Old description',
      };

      const desired = {
        description: 'New description',
        dependencies: ['new-dep'],
      };

      const plan = processor.planChanges(current, desired);

      expect(plan.summary).toContain('modified: Modified description');
      expect(plan.summary).toContain('added: Added dependencies');
    });

    it('should validate the resulting item', (): void => {
      const current: RegistryItem = {
        name: 'test',
        type: 'registry:component',
      };

      // Use proper type assertion for invalid enum value
      const desired = {type: 'invalid-type' as 'registry:component'};
      const plan = processor.planChanges(current, desired);

      expect(plan.validationIssues).toHaveLength(1);
      expect(plan.validationIssues[0]?.type).toBe('result');
      expect(plan.validationIssues[0]?.issues[0]).toContain(
        "Field 'type' must be one of:",
      );
    });

    it('should preserve name and type in resulting item', (): void => {
      const current: RegistryItem = {
        name: 'test-component',
        type: 'registry:component',
        description: 'Test description',
      };

      const desired = {description: 'New description'};
      const plan = processor.planChanges(current, desired);

      expect(plan.resultingItem.name).toBe('test-component');
      expect(plan.resultingItem.type).toBe('registry:component');
      expect(plan.resultingItem.description).toBe('New description');
    });
  });

  describe('generateTemplate', (): void => {
    it('should generate template with default type', (): void => {
      const template = processor.generateTemplate();

      expect(template.name).toBe('');
      expect(template.type).toBe('registry:component');
      expect(template.files).toEqual([]);
      expect(template.dependencies).toEqual([]);
    });

    it('should generate template with specified type', (): void => {
      const template = processor.generateTemplate('registry:hook');

      expect(template.name).toBe('');
      expect(template.type).toBe('registry:hook');
      expect(template.files).toEqual([]);
    });

    it('should include type defaults for component type', (): void => {
      const template = processor.generateTemplate('registry:component');

      expect(template.dependencies).toEqual([]);
      expect(template.files).toEqual([]);
    });
  });

  describe('getSchemaInfo', (): void => {
    it('should return schema information', (): void => {
      const info = processor.getSchemaInfo();

      expect(info.schemaVersion).toBe(
        'http://json-schema.org/draft-07/schema#',
      );
      expect(info.type).toBe('object');
      expect(info.required).toEqual(['name', 'type']);
      expect(info.properties).toContain('name');
      expect(info.properties).toContain('type');
      expect(info.properties).toContain('description');
    });

    it('should return property details', (): void => {
      const info = processor.getSchemaInfo();

      const nameProperty = info.propertyDetails.find(p => p.name === 'name');
      expect(nameProperty).toBeDefined();
      expect(nameProperty?.type).toBe('string');
      expect(nameProperty?.required).toBe(true);

      const typeProperty = info.propertyDetails.find(p => p.name === 'type');
      expect(typeProperty).toBeDefined();
      expect(typeProperty?.enum).toEqual([
        'registry:component',
        'registry:block',
        'registry:hook',
      ]);
    });
  });

  describe('getInfo', (): void => {
    it('should be an alias for getSchemaInfo', (): void => {
      const schemaInfo = processor.getSchemaInfo();
      const info = processor.getInfo();

      expect(info).toEqual(schemaInfo);
    });
  });

  describe('getTypes', (): void => {
    it('should return available registry types', (): void => {
      const types = processor.getTypes();

      expect(types).toEqual([
        'registry:component',
        'registry:block',
        'registry:hook',
      ]);
    });
  });

  describe('getFileTypes', (): void => {
    it('should return available file types', (): void => {
      const fileTypes = processor.getFileTypes();

      expect(fileTypes).toEqual([
        'registry:ui',
        'registry:component',
        'registry:lib',
      ]);
    });

    it('should return empty array if no file types defined', (): void => {
      const schemaWithoutFileTypes: RegistrySchema = {
        type: 'object',
        properties: {
          name: {type: 'string'},
          type: {type: 'string'},
        },
        required: ['name', 'type'],
      };

      const processorWithoutFileTypes = createSchemaProcessor(
        schemaWithoutFileTypes,
      );
      const fileTypes = processorWithoutFileTypes.getFileTypes();

      expect(fileTypes).toEqual([]);
    });
  });

  describe('edge cases', (): void => {
    it('should handle schema without required fields', (): void => {
      const schemaWithoutRequired: RegistrySchema = {
        type: 'object',
        properties: {
          name: {type: 'string'},
          type: {type: 'string'},
        },
      };

      const processorWithoutRequired = createSchemaProcessor(
        schemaWithoutRequired,
      );
      const info = processorWithoutRequired.getSchemaInfo();

      expect(info.required).toEqual([]);
    });

    it('should handle validation of items with schema fields', (): void => {
      const itemWithSchemaFields = {
        name: 'test',
        type: 'registry:component',
        $schema: 'some-schema',
        $id: 'some-id',
        metadata: {custom: 'data'},
      } as RegistryItem;

      const result = processor.validate(itemWithSchemaFields);

      // Schema fields should not cause validation errors
      expect(result.isValid).toBe(true);
    });

    it('should handle empty change plan', (): void => {
      const current: RegistryItem = {
        name: 'test',
        type: 'registry:component',
      };

      const plan = processor.planChanges(current, {});

      expect(plan.changes).toHaveLength(0);
      expect(plan.additions).toHaveLength(0);
      expect(plan.removals).toHaveLength(0);
      expect(plan.summary).toBe('');
    });

    it('should handle missing schema properties', (): void => {
      const minimalSchema: RegistrySchema = {
        type: 'object',
        properties: {},
      };

      const minimalProcessor = createSchemaProcessor(minimalSchema);
      const info = minimalProcessor.getSchemaInfo();

      expect(info.properties).toEqual([]);
      expect(info.propertyDetails).toEqual([]);
    });
  });
});
