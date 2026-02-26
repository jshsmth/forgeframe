import { describe, it, expect, vi } from 'vitest';
import { validateProps } from '@/props/normalize';
import {
  isStandardSchema,
  validateWithSchema,
  type StandardSchemaV1,
} from '@/props/schema';
import { prop } from '@/props/prop';
import type { PropsDefinition } from '@/types';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Creates a mock Standard Schema for testing purposes.
 */
function createMockSchema<T>(
  validator: (
    value: unknown
  ) =>
    | { value: T }
    | {
        issues: Array<{
          message: string;
          path?: Array<PropertyKey | { key?: PropertyKey; index?: number }>;
        }>;
      }
): StandardSchemaV1<unknown, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: validator,
    },
  };
}

/**
 * Creates an async mock schema that returns a Promise.
 */
function createAsyncMockSchema<T>(
  validator: (
    value: unknown
  ) => { value: T } | { issues: Array<{ message: string }> }
): StandardSchemaV1<unknown, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test-async',
      validate: (value: unknown) => Promise.resolve(validator(value)),
    },
  };
}

// ============================================================================
// isStandardSchema Tests
// ============================================================================

describe('isStandardSchema', () => {
  it('should identify valid Standard Schema objects', () => {
    const schema = createMockSchema(() => ({ value: 'test' }));
    expect(isStandardSchema(schema)).toBe(true);
  });

  it('should reject null', () => {
    expect(isStandardSchema(null)).toBe(false);
  });

  it('should reject undefined', () => {
    expect(isStandardSchema(undefined)).toBe(false);
  });

  it('should reject primitives', () => {
    expect(isStandardSchema('string')).toBe(false);
    expect(isStandardSchema(123)).toBe(false);
    expect(isStandardSchema(true)).toBe(false);
  });

  it('should reject empty objects', () => {
    expect(isStandardSchema({})).toBe(false);
  });

  it('should reject objects without ~standard property', () => {
    expect(isStandardSchema({ version: 1, vendor: 'test' })).toBe(false);
  });

  it('should reject objects with wrong version', () => {
    expect(
      isStandardSchema({
        '~standard': {
          version: 2,
          vendor: 'test',
          validate: () => ({ value: 'test' }),
        },
      })
    ).toBe(false);
  });

  it('should reject objects without validate function', () => {
    expect(
      isStandardSchema({
        '~standard': {
          version: 1,
          vendor: 'test',
        },
      })
    ).toBe(false);
  });

  it('should reject objects without vendor string', () => {
    expect(
      isStandardSchema({
        '~standard': {
          version: 1,
          validate: () => ({ value: 'test' }),
        },
      })
    ).toBe(false);

    expect(
      isStandardSchema({
        '~standard': {
          version: 1,
          vendor: 123,
          validate: () => ({ value: 'test' }),
        },
      })
    ).toBe(false);
  });

  it('should reject objects with null ~standard', () => {
    expect(isStandardSchema({ '~standard': null })).toBe(false);
  });
});

// ============================================================================
// validateWithSchema Tests
// ============================================================================

describe('validateWithSchema', () => {
  it('should return the value on successful validation', () => {
    const schema = createMockSchema<string>((v) => ({
      value: String(v),
    }));
    const result = validateWithSchema(schema, 'hello', 'testProp');
    expect(result).toBe('hello');
  });

  it('should return transformed value when schema transforms', () => {
    const schema = createMockSchema<string>((v) => ({
      value: String(v).toUpperCase(),
    }));
    const result = validateWithSchema(schema, 'hello', 'testProp');
    expect(result).toBe('HELLO');
  });

  it('should throw on validation failure', () => {
    const schema = createMockSchema(() => ({
      issues: [{ message: 'Invalid value' }],
    }));
    expect(() => validateWithSchema(schema, 'bad', 'testProp')).toThrow(
      'Validation failed: testProp: Invalid value'
    );
  });

  it('should format multiple issues', () => {
    const schema = createMockSchema(() => ({
      issues: [{ message: 'Error 1' }, { message: 'Error 2' }],
    }));
    expect(() => validateWithSchema(schema, 'bad', 'testProp')).toThrow(
      'Validation failed: testProp: Error 1; testProp: Error 2'
    );
  });

  it('should format nested paths', () => {
    const schema = createMockSchema(() => ({
      issues: [{ message: 'Invalid', path: ['user', 'email'] }],
    }));
    expect(() => validateWithSchema(schema, {}, 'config')).toThrow(
      'Validation failed: config.user.email: Invalid'
    );
  });

  it('should format paths with PathSegment objects', () => {
    const schema = createMockSchema(() => ({
      issues: [{ message: 'Invalid', path: [{ key: 'items' }, { key: '0' }] }],
    }));
    expect(() => validateWithSchema(schema, {}, 'data')).toThrow(
      'Validation failed: data.items.0: Invalid'
    );
  });

  it('should format paths with PathSegment index objects', () => {
    const schema = createMockSchema(() => ({
      issues: [{ message: 'Invalid', path: [{ key: 'items' }, { index: 0 }] }],
    }));
    expect(() => validateWithSchema(schema, {}, 'data')).toThrow(
      'Validation failed: data.items.0: Invalid'
    );
  });

  it('should throw clear error for async schemas', () => {
    const schema = createAsyncMockSchema(() => ({ value: 'test' }));
    expect(() => validateWithSchema(schema, 'value', 'asyncProp')).toThrow(
      'Prop "asyncProp" uses an async schema'
    );
    expect(() => validateWithSchema(schema, 'value', 'asyncProp')).toThrow(
      'ForgeFrame only supports synchronous schema validation'
    );
  });
});

// ============================================================================
// validateProps with Schema Integration Tests
// ============================================================================

describe('validateProps with schema', () => {
  it('should validate using schema instead of type', () => {
    const schema = createMockSchema<string>((v) => {
      if (typeof v === 'string' && v.includes('@')) {
        return { value: v };
      }
      return { issues: [{ message: 'Must be an email' }] };
    });

    const definitions: PropsDefinition<{ email: string }> = {
      email: { schema },
    };

    // Valid email
    expect(() =>
      validateProps({ email: 'user@example.com' }, definitions)
    ).not.toThrow();

    // Invalid email
    expect(() => validateProps({ email: 'invalid' }, definitions)).toThrow(
      'Must be an email'
    );
  });

  it('should store transformed value from schema', () => {
    const schema = createMockSchema<string>((v) => ({
      value: String(v).toLowerCase(),
    }));

    const definitions: PropsDefinition<{ name: string }> = {
      name: { schema },
    };

    const props = { name: 'UPPERCASE' };
    validateProps(props, definitions);

    expect(props.name).toBe('uppercase');
  });

  it('should run custom validate after schema', () => {
    const customValidate = vi.fn();
    const schema = createMockSchema<string>((v) => ({
      value: String(v).trim(),
    }));

    const definitions: PropsDefinition<{ name: string }> = {
      name: {
        schema,
        validate: customValidate,
      },
    };

    validateProps({ name: '  test  ' }, definitions);

    // Custom validate should receive the transformed value
    expect(customValidate).toHaveBeenCalledWith({
      value: 'test', // Trimmed by schema
      props: expect.objectContaining({ name: 'test' }),
    });
  });

  it('should check required before schema validation', () => {
    const schema = createMockSchema<string>((v) => ({ value: String(v) }));

    const definitions: PropsDefinition<{ name: string }> = {
      name: { schema, required: true },
    };

    expect(() =>
      validateProps({ name: undefined } as unknown as { name: string }, definitions)
    ).toThrow('Prop "name" is required');
  });

  it('should skip schema validation for undefined non-required props', () => {
    const validateFn = vi.fn(() => ({ value: 'test' }));
    const schema: StandardSchemaV1<unknown, string> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: validateFn,
      },
    };

    const definitions: PropsDefinition<{ name?: string }> = {
      name: { schema },
    };

    validateProps({} as { name?: string }, definitions);
    expect(validateFn).not.toHaveBeenCalled();
  });

  it('should handle schema that transforms values', () => {
    // Schema accepts any value and transforms to string
    const schema = createMockSchema<string>((v) => ({
      value: `processed: ${v}`,
    }));

    const definitions: PropsDefinition<{ value: string }> = {
      value: { schema },
    };

    // Pass a number - schema transforms it to string
    const props = { value: 42 as unknown as string };
    validateProps(props, definitions);

    expect(props.value).toBe('processed: 42');
  });
});

// ============================================================================
// Prop Schema API Tests
// ============================================================================

describe('prop schema API', () => {
  it('should work with direct prop schemas', () => {
    const definitions: PropsDefinition<{ name: string; age: number }> = {
      name: prop.string(),
      age: prop.number(),
    };

    // Valid props
    expect(() =>
      validateProps({ name: 'test', age: 25 }, definitions)
    ).not.toThrow();

    // Invalid type
    expect(() =>
      validateProps({ name: 123 as unknown as string, age: 25 }, definitions)
    ).toThrow('Expected string');
  });

  it('should work with custom validate function alongside schema', () => {
    const definitions: PropsDefinition<{ email: string }> = {
      email: {
        schema: prop.string(),
        validate: ({ value }) => {
          if (!value.includes('@')) {
            throw new Error('Invalid email format');
          }
        },
      },
    };

    expect(() =>
      validateProps({ email: 'user@example.com' }, definitions)
    ).not.toThrow();

    expect(() => validateProps({ email: 'invalid' }, definitions)).toThrow(
      'Invalid email format'
    );
  });

  it('should work with required validation', () => {
    const definitions: PropsDefinition<{ name: string }> = {
      name: { schema: prop.string(), required: true },
    };

    expect(() =>
      validateProps({ name: undefined } as unknown as { name: string }, definitions)
    ).toThrow('required');
  });

  it('should allow mixing custom schema and prop schemas', () => {
    const customSchema = createMockSchema<{ id: string }>((v) => {
      if (typeof v === 'object' && v !== null && 'id' in v) {
        return { value: v as { id: string } };
      }
      return { issues: [{ message: 'Must have id' }] };
    });

    const definitions: PropsDefinition<{
      user: { id: string };
      callback: () => void;
    }> = {
      user: { schema: customSchema },
      callback: prop.function(),
    };

    const callback = vi.fn();
    expect(() =>
      validateProps({ user: { id: '123' }, callback }, definitions)
    ).not.toThrow();
  });
});
