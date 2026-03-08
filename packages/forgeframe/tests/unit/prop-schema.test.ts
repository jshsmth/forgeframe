/**
 * Unit tests for the `prop` schema builder API.
 *
 * Covers Standard Schema compatibility, primitive/composite validators, schema chaining immutability, and normalizeProps integration.
 */
import { describe, it, expect } from 'vitest';
import {
  prop,
  PropSchema,
  StringSchema,
  NumberSchema,
  BooleanSchema,
  FunctionSchema,
  ArraySchema,
  ObjectSchema,
  LiteralSchema,
  EnumSchema,
  AnySchema,
} from '#internal/props/prop';
import { isStandardSchema } from '#internal/props/schema';
import { validateProps } from '#internal/props/normalize';
import type { PropsDefinition } from '#internal/types';

// ============================================================================
// StandardSchemaV1 Compliance Tests
// ============================================================================

describe('StandardSchemaV1 compliance', () => {
  it('prop.string() should be a valid StandardSchemaV1', () => {
    expect(isStandardSchema(prop.string())).toBe(true);
  });

  it('prop.number() should be a valid StandardSchemaV1', () => {
    expect(isStandardSchema(prop.number())).toBe(true);
  });

  it('prop.boolean() should be a valid StandardSchemaV1', () => {
    expect(isStandardSchema(prop.boolean())).toBe(true);
  });

  it('prop.function() should be a valid StandardSchemaV1', () => {
    expect(isStandardSchema(prop.function())).toBe(true);
  });

  it('prop.array() should be a valid StandardSchemaV1', () => {
    expect(isStandardSchema(prop.array())).toBe(true);
  });

  it('prop.object() should be a valid StandardSchemaV1', () => {
    expect(isStandardSchema(prop.object())).toBe(true);
  });

  it('prop.literal() should be a valid StandardSchemaV1', () => {
    expect(isStandardSchema(prop.literal('test'))).toBe(true);
  });

  it('prop.enum() should be a valid StandardSchemaV1', () => {
    expect(isStandardSchema(prop.enum(['a', 'b']))).toBe(true);
  });

  it('prop.any() should be a valid StandardSchemaV1', () => {
    expect(isStandardSchema(prop.any())).toBe(true);
  });

  it('should have vendor set to "forgeframe"', () => {
    expect(prop.string()['~standard'].vendor).toBe('forgeframe');
  });

  it('should have version set to 1', () => {
    expect(prop.string()['~standard'].version).toBe(1);
  });
});

// ============================================================================
// String Schema Tests
// ============================================================================

describe('prop.string()', () => {
  it('should validate strings', () => {
    const schema = prop.string();
    const result = schema['~standard'].validate('hello');
    expect(result).toEqual({ value: 'hello' });
  });

  it('should reject non-strings', () => {
    const schema = prop.string();
    const result = schema['~standard'].validate(123);
    expect(result).toHaveProperty('issues');
    expect((result as { issues: Array<{ message: string }> }).issues[0].message).toContain(
      'Expected string'
    );
  });

  it('should reject undefined when not optional', () => {
    const schema = prop.string();
    const result = schema['~standard'].validate(undefined);
    expect(result).toHaveProperty('issues');
    expect((result as { issues: Array<{ message: string }> }).issues[0].message).toBe('Required');
  });

  it('should accept undefined when optional', () => {
    const schema = prop.string().optional();
    const result = schema['~standard'].validate(undefined);
    expect(result).toEqual({ value: undefined });
  });

  it('should use default value when undefined', () => {
    const schema = prop.string().default('fallback');
    const result = schema['~standard'].validate(undefined);
    expect(result).toEqual({ value: 'fallback' });
  });

  it('should use default function when undefined', () => {
    let counter = 0;
    const schema = prop.string().default(() => `value-${++counter}`);
    expect(schema['~standard'].validate(undefined)).toEqual({ value: 'value-1' });
    expect(schema['~standard'].validate(undefined)).toEqual({ value: 'value-2' });
  });

  it('should validate min length', () => {
    const schema = prop.string().min(3);
    expect(schema['~standard'].validate('ab')).toHaveProperty('issues');
    expect(schema['~standard'].validate('abc')).toEqual({ value: 'abc' });
  });

  it('should validate max length', () => {
    const schema = prop.string().max(3);
    expect(schema['~standard'].validate('abcd')).toHaveProperty('issues');
    expect(schema['~standard'].validate('abc')).toEqual({ value: 'abc' });
  });

  it('should validate exact length', () => {
    const schema = prop.string().length(3);
    expect(schema['~standard'].validate('ab')).toHaveProperty('issues');
    expect(schema['~standard'].validate('abcd')).toHaveProperty('issues');
    expect(schema['~standard'].validate('abc')).toEqual({ value: 'abc' });
  });

  it('should validate pattern', () => {
    const schema = prop.string().pattern(/^[a-z]+$/);
    expect(schema['~standard'].validate('ABC')).toHaveProperty('issues');
    expect(schema['~standard'].validate('abc')).toEqual({ value: 'abc' });
  });

  it('should validate email', () => {
    const schema = prop.string().email();
    expect(schema['~standard'].validate('invalid')).toHaveProperty('issues');
    expect(schema['~standard'].validate('user@example.com')).toEqual({
      value: 'user@example.com',
    });
  });

  it('should validate url', () => {
    const schema = prop.string().url();
    expect(schema['~standard'].validate('invalid')).toHaveProperty('issues');
    expect(schema['~standard'].validate('https://example.com')).toEqual({
      value: 'https://example.com',
    });
  });

  it('should validate uuid', () => {
    const schema = prop.string().uuid();
    expect(schema['~standard'].validate('invalid')).toHaveProperty('issues');
    expect(
      schema['~standard'].validate('550e8400-e29b-41d4-a716-446655440000')
    ).toEqual({ value: '550e8400-e29b-41d4-a716-446655440000' });
  });

  it('should validate nonempty', () => {
    const schema = prop.string().nonempty();
    expect(schema['~standard'].validate('')).toHaveProperty('issues');
    expect(schema['~standard'].validate('a')).toEqual({ value: 'a' });
  });

  it('should support custom pattern message', () => {
    const schema = prop.string().pattern(/^[a-z]+$/, 'Only lowercase letters');
    const result = schema['~standard'].validate('ABC');
    expect((result as { issues: Array<{ message: string }> }).issues[0].message).toBe(
      'Only lowercase letters'
    );
  });

  it('should validate global regex patterns consistently', () => {
    const schema = prop.string().pattern(/^[a-z]+$/g);

    expect(schema['~standard'].validate('abc')).toEqual({ value: 'abc' });
    expect(schema['~standard'].validate('abc')).toEqual({ value: 'abc' });
  });
});

// ============================================================================
// Number Schema Tests
// ============================================================================

describe('prop.number()', () => {
  it('should validate numbers', () => {
    const schema = prop.number();
    expect(schema['~standard'].validate(42)).toEqual({ value: 42 });
  });

  it('should reject non-numbers', () => {
    const schema = prop.number();
    const result = schema['~standard'].validate('42');
    expect(result).toHaveProperty('issues');
  });

  it('should reject NaN', () => {
    const schema = prop.number();
    const result = schema['~standard'].validate(NaN);
    expect(result).toHaveProperty('issues');
  });

  it('should validate min', () => {
    const schema = prop.number().min(10);
    expect(schema['~standard'].validate(5)).toHaveProperty('issues');
    expect(schema['~standard'].validate(10)).toEqual({ value: 10 });
    expect(schema['~standard'].validate(15)).toEqual({ value: 15 });
  });

  it('should validate max', () => {
    const schema = prop.number().max(10);
    expect(schema['~standard'].validate(15)).toHaveProperty('issues');
    expect(schema['~standard'].validate(10)).toEqual({ value: 10 });
    expect(schema['~standard'].validate(5)).toEqual({ value: 5 });
  });

  it('should validate int', () => {
    const schema = prop.number().int();
    expect(schema['~standard'].validate(3.14)).toHaveProperty('issues');
    expect(schema['~standard'].validate(42)).toEqual({ value: 42 });
  });

  it('should validate positive', () => {
    const schema = prop.number().positive();
    expect(schema['~standard'].validate(0)).toHaveProperty('issues');
    expect(schema['~standard'].validate(-1)).toHaveProperty('issues');
    expect(schema['~standard'].validate(1)).toEqual({ value: 1 });
  });

  it('should validate nonnegative', () => {
    const schema = prop.number().nonnegative();
    expect(schema['~standard'].validate(-1)).toHaveProperty('issues');
    expect(schema['~standard'].validate(0)).toEqual({ value: 0 });
    expect(schema['~standard'].validate(1)).toEqual({ value: 1 });
  });

  it('should validate negative', () => {
    const schema = prop.number().negative();
    expect(schema['~standard'].validate(0)).toHaveProperty('issues');
    expect(schema['~standard'].validate(1)).toHaveProperty('issues');
    expect(schema['~standard'].validate(-1)).toEqual({ value: -1 });
  });

  it('should support default', () => {
    const schema = prop.number().default(0);
    expect(schema['~standard'].validate(undefined)).toEqual({ value: 0 });
  });

  it('should support optional', () => {
    const schema = prop.number().optional();
    expect(schema['~standard'].validate(undefined)).toEqual({ value: undefined });
  });
});

// ============================================================================
// Boolean Schema Tests
// ============================================================================

describe('prop.boolean()', () => {
  it('should validate booleans', () => {
    const schema = prop.boolean();
    expect(schema['~standard'].validate(true)).toEqual({ value: true });
    expect(schema['~standard'].validate(false)).toEqual({ value: false });
  });

  it('should reject non-booleans', () => {
    const schema = prop.boolean();
    expect(schema['~standard'].validate(1)).toHaveProperty('issues');
    expect(schema['~standard'].validate('true')).toHaveProperty('issues');
  });

  it('should support default', () => {
    const schema = prop.boolean().default(false);
    expect(schema['~standard'].validate(undefined)).toEqual({ value: false });
  });
});

// ============================================================================
// Function Schema Tests
// ============================================================================

describe('prop.function()', () => {
  it('should validate functions', () => {
    const fn = () => {};
    const schema = prop.function();
    expect(schema['~standard'].validate(fn)).toEqual({ value: fn });
  });

  it('should reject non-functions', () => {
    const schema = prop.function();
    expect(schema['~standard'].validate('not a function')).toHaveProperty('issues');
    expect(schema['~standard'].validate({})).toHaveProperty('issues');
  });

  it('should support optional', () => {
    const schema = prop.function().optional();
    expect(schema['~standard'].validate(undefined)).toEqual({ value: undefined });
  });
});

// ============================================================================
// Array Schema Tests
// ============================================================================

describe('prop.array()', () => {
  it('should validate arrays', () => {
    const schema = prop.array();
    expect(schema['~standard'].validate([1, 2, 3])).toEqual({ value: [1, 2, 3] });
  });

  it('should reject non-arrays', () => {
    const schema = prop.array();
    expect(schema['~standard'].validate('not an array')).toHaveProperty('issues');
    expect(schema['~standard'].validate({})).toHaveProperty('issues');
  });

  it('should validate array items with of()', () => {
    const schema = prop.array().of(prop.string());
    expect(schema['~standard'].validate(['a', 'b', 'c'])).toEqual({
      value: ['a', 'b', 'c'],
    });
    expect(schema['~standard'].validate(['a', 1, 'c'])).toHaveProperty('issues');
  });

  it('should include path in item validation errors', () => {
    const schema = prop.array().of(prop.string());
    const result = schema['~standard'].validate(['a', 1, 'c']);
    expect((result as { issues: Array<{ path?: unknown[] }> }).issues[0].path).toEqual([1]);
  });

  it('should validate min length', () => {
    const schema = prop.array().min(2);
    expect(schema['~standard'].validate([1])).toHaveProperty('issues');
    expect(schema['~standard'].validate([1, 2])).toEqual({ value: [1, 2] });
  });

  it('should validate max length', () => {
    const schema = prop.array().max(2);
    expect(schema['~standard'].validate([1, 2, 3])).toHaveProperty('issues');
    expect(schema['~standard'].validate([1, 2])).toEqual({ value: [1, 2] });
  });

  it('should validate nonempty', () => {
    const schema = prop.array().nonempty();
    expect(schema['~standard'].validate([])).toHaveProperty('issues');
    expect(schema['~standard'].validate([1])).toEqual({ value: [1] });
  });

  it('should support default', () => {
    const schema = prop.array().default([]);
    expect(schema['~standard'].validate(undefined)).toEqual({ value: [] });
  });
});

// ============================================================================
// Object Schema Tests
// ============================================================================

describe('prop.object()', () => {
  it('should validate objects', () => {
    const schema = prop.object();
    expect(schema['~standard'].validate({ a: 1 })).toEqual({ value: { a: 1 } });
  });

  it('should reject non-objects', () => {
    const schema = prop.object();
    expect(schema['~standard'].validate('not an object')).toHaveProperty('issues');
    expect(schema['~standard'].validate(null)).toHaveProperty('issues');
    expect(schema['~standard'].validate([1, 2])).toHaveProperty('issues');
  });

  it('should validate shape', () => {
    const schema = prop.object().shape({
      name: prop.string(),
      age: prop.number(),
    });
    expect(schema['~standard'].validate({ name: 'John', age: 30 })).toEqual({
      value: { name: 'John', age: 30 },
    });
  });

  it('should include path in shape validation errors', () => {
    const schema = prop.object().shape({
      user: prop.object().shape({
        email: prop.string().email(),
      }),
    });
    const result = schema['~standard'].validate({ user: { email: 'invalid' } });
    expect((result as { issues: Array<{ path?: unknown[] }> }).issues[0].path).toEqual([
      'user',
      'email',
    ]);
  });

  it('should allow extra keys by default', () => {
    const schema = prop.object().shape({
      name: prop.string(),
    });
    const result = schema['~standard'].validate({ name: 'John', extra: true });
    expect(result).toEqual({ value: { name: 'John', extra: true } });
  });

  it('should reject extra keys in strict mode', () => {
    const schema = prop.object().shape({
      name: prop.string(),
    }).strict();
    const result = schema['~standard'].validate({ name: 'John', extra: true });
    expect(result).toHaveProperty('issues');
    expect((result as { issues: Array<{ message: string }> }).issues[0].message).toContain(
      'Unknown key'
    );
  });

  it('should support optional fields', () => {
    const schema = prop.object().shape({
      name: prop.string(),
      nickname: prop.string().optional(),
    });
    expect(schema['~standard'].validate({ name: 'John' })).toEqual({
      value: { name: 'John', nickname: undefined },
    });
  });

  it('should support default values in shape', () => {
    const schema = prop.object().shape({
      name: prop.string(),
      role: prop.string().default('user'),
    });
    expect(schema['~standard'].validate({ name: 'John' })).toEqual({
      value: { name: 'John', role: 'user' },
    });
  });
});

// ============================================================================
// Literal Schema Tests
// ============================================================================

describe('prop.literal()', () => {
  it('should validate exact string match', () => {
    const schema = prop.literal('active');
    expect(schema['~standard'].validate('active')).toEqual({ value: 'active' });
    expect(schema['~standard'].validate('inactive')).toHaveProperty('issues');
  });

  it('should validate exact number match', () => {
    const schema = prop.literal(42);
    expect(schema['~standard'].validate(42)).toEqual({ value: 42 });
    expect(schema['~standard'].validate(43)).toHaveProperty('issues');
  });

  it('should validate exact boolean match', () => {
    const schema = prop.literal(true);
    expect(schema['~standard'].validate(true)).toEqual({ value: true });
    expect(schema['~standard'].validate(false)).toHaveProperty('issues');
  });
});

// ============================================================================
// Enum Schema Tests
// ============================================================================

describe('prop.enum()', () => {
  it('should validate string enum values', () => {
    const schema = prop.enum(['pending', 'active', 'completed'] as const);
    expect(schema['~standard'].validate('active')).toEqual({ value: 'active' });
    expect(schema['~standard'].validate('invalid')).toHaveProperty('issues');
  });

  it('should validate number enum values', () => {
    const schema = prop.enum([1, 2, 3] as const);
    expect(schema['~standard'].validate(2)).toEqual({ value: 2 });
    expect(schema['~standard'].validate(4)).toHaveProperty('issues');
  });

  it('should list allowed values in error message', () => {
    const schema = prop.enum(['a', 'b', 'c'] as const);
    const result = schema['~standard'].validate('d');
    expect((result as { issues: Array<{ message: string }> }).issues[0].message).toContain(
      '"a"'
    );
    expect((result as { issues: Array<{ message: string }> }).issues[0].message).toContain(
      '"b"'
    );
    expect((result as { issues: Array<{ message: string }> }).issues[0].message).toContain(
      '"c"'
    );
  });

  it('should support default', () => {
    const schema = prop.enum(['a', 'b'] as const).default('a');
    expect(schema['~standard'].validate(undefined)).toEqual({ value: 'a' });
  });
});

// ============================================================================
// Any Schema Tests
// ============================================================================

describe('prop.any()', () => {
  it('should accept any value', () => {
    const schema = prop.any();
    expect(schema['~standard'].validate('string')).toEqual({ value: 'string' });
    expect(schema['~standard'].validate(123)).toEqual({ value: 123 });
    expect(schema['~standard'].validate({ a: 1 })).toEqual({ value: { a: 1 } });
    expect(schema['~standard'].validate(null)).toEqual({ value: null });
  });

  it('should still require value when not optional', () => {
    const schema = prop.any();
    expect(schema['~standard'].validate(undefined)).toHaveProperty('issues');
  });

  it('should accept undefined when optional', () => {
    const schema = prop.any().optional();
    expect(schema['~standard'].validate(undefined)).toEqual({ value: undefined });
  });
});

// ============================================================================
// Chaining / Immutability Tests
// ============================================================================

describe('schema chaining and immutability', () => {
  it('should return new instance on optional()', () => {
    const original = prop.string();
    const modified = original.optional();
    expect(modified).not.toBe(original);
  });

  it('should return new instance on default()', () => {
    const original = prop.string();
    const modified = original.default('test');
    expect(modified).not.toBe(original);
  });

  it('should not modify original when chaining', () => {
    const original = prop.string();
    original.min(5);
    // Original should still require non-empty
    expect(original['~standard'].validate('ab')).toEqual({ value: 'ab' });
  });

  it('should allow complex chaining', () => {
    const schema = prop
      .string()
      .min(2)
      .max(10)
      .pattern(/^[a-z]+$/)
      .default('abc');

    expect(schema['~standard'].validate(undefined)).toEqual({ value: 'abc' });
    expect(schema['~standard'].validate('a')).toHaveProperty('issues');
    expect(schema['~standard'].validate('abcdefghijk')).toHaveProperty('issues');
    expect(schema['~standard'].validate('ABC')).toHaveProperty('issues');
    expect(schema['~standard'].validate('hello')).toEqual({ value: 'hello' });
  });
});

// ============================================================================
// Integration with validateProps Tests
// ============================================================================

describe('integration with validateProps', () => {
  it('should work with prop.string() in component props', () => {
    const definitions: PropsDefinition<{ name: string }> = {
      name: prop.string(),
    };

    expect(() => validateProps({ name: 'John' }, definitions)).not.toThrow();
    expect(() => validateProps({ name: 123 } as unknown as { name: string }, definitions)).toThrow();
  });

  it('should work with prop.number().default() in component props', () => {
    const definitions: PropsDefinition<{ count: number }> = {
      count: prop.number().default(0),
    };

    const props = { count: undefined } as unknown as { count: number };
    validateProps(props, definitions);
    expect(props.count).toBe(0);
  });

  it('should work with prop.enum() in component props', () => {
    const definitions: PropsDefinition<{ status: 'pending' | 'active' }> = {
      status: prop.enum(['pending', 'active'] as const),
    };

    expect(() => validateProps({ status: 'active' }, definitions)).not.toThrow();
    expect(() =>
      validateProps({ status: 'invalid' } as unknown as { status: 'pending' | 'active' }, definitions)
    ).toThrow();
  });

  it('should work with nested prop.object().shape()', () => {
    type UserConfig = {
      config: {
        theme: string;
        debug: boolean;
      };
    };

    const definitions: PropsDefinition<UserConfig> = {
      config: prop.object().shape({
        theme: prop.string().default('light'),
        debug: prop.boolean().default(false),
      }),
    };

    const props = { config: {} } as unknown as UserConfig;
    validateProps(props, definitions);
    expect(props.config).toEqual({ theme: 'light', debug: false });
  });

  it('should work with prop.array().of()', () => {
    const definitions: PropsDefinition<{ tags: string[] }> = {
      tags: prop.array().of(prop.string()),
    };

    expect(() => validateProps({ tags: ['a', 'b', 'c'] }, definitions)).not.toThrow();
    expect(() =>
      validateProps({ tags: ['a', 1, 'c'] } as unknown as { tags: string[] }, definitions)
    ).toThrow();
  });

  it('should work with mixed prop schemas', () => {
    interface MyProps {
      name: string;
      count: number;
      email: string;
      tags: string[];
      status: 'active' | 'inactive';
    }

    const definitions: PropsDefinition<MyProps> = {
      name: prop.string().min(1),
      count: prop.number().default(0),
      email: prop.string().email().optional(),
      tags: prop.array().of(prop.string()).default([]),
      status: prop.enum(['active', 'inactive'] as const).default('active'),
    };

    const props: Partial<MyProps> = { name: 'Test' };
    validateProps(props as MyProps, definitions);

    expect(props.count).toBe(0);
    expect(props.tags).toEqual([]);
    expect(props.status).toBe('active');
  });
});

// ============================================================================
// Class Exports Tests
// ============================================================================

describe('exported schema classes', () => {
  it('should export PropSchema base class', () => {
    expect(PropSchema).toBeDefined();
  });

  it('should export StringSchema class', () => {
    expect(new StringSchema()).toBeInstanceOf(PropSchema);
  });

  it('should export NumberSchema class', () => {
    expect(new NumberSchema()).toBeInstanceOf(PropSchema);
  });

  it('should export BooleanSchema class', () => {
    expect(new BooleanSchema()).toBeInstanceOf(PropSchema);
  });

  it('should export FunctionSchema class', () => {
    expect(new FunctionSchema()).toBeInstanceOf(PropSchema);
  });

  it('should export ArraySchema class', () => {
    expect(new ArraySchema()).toBeInstanceOf(PropSchema);
  });

  it('should export ObjectSchema class', () => {
    expect(new ObjectSchema()).toBeInstanceOf(PropSchema);
  });

  it('should export LiteralSchema class', () => {
    expect(new LiteralSchema('test')).toBeInstanceOf(PropSchema);
  });

  it('should export EnumSchema class', () => {
    expect(new EnumSchema(['a', 'b'])).toBeInstanceOf(PropSchema);
  });

  it('should export AnySchema class', () => {
    expect(new AnySchema()).toBeInstanceOf(PropSchema);
  });
});
