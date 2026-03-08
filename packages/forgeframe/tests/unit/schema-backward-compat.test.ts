/**
 * Backward compatibility tests for Standard Schema support in `#internal/props/schema`.
 *
 * Covers legacy schema shape acceptance, path segment compatibility, and optional metadata handling.
 */
import { describe, expect, it } from 'vitest';
import {
  isStandardSchema,
  validateWithSchema,
  type StandardSchemaV1,
} from '#internal/props/schema';

describe('Standard Schema backward compatibility', () => {
  it('should accept legacy schema objects without ~standard.types metadata', () => {
    const legacySchema: StandardSchemaV1<unknown, string> = {
      '~standard': {
        version: 1,
        vendor: 'legacy-validator',
        validate: (value: unknown) => {
          if (typeof value === 'string') {
            return { value };
          }

          return {
            issues: [{ message: 'Expected string' }],
          };
        },
      },
    };

    expect(isStandardSchema(legacySchema)).toBe(true);
    expect(validateWithSchema(legacySchema, 'ok', 'name')).toBe('ok');
    expect(() => validateWithSchema(legacySchema, 123, 'name')).toThrow(
      'Validation failed: name: Expected string'
    );
  });

  it('should keep supporting legacy path segments that use only key', () => {
    const legacyPathSchema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'legacy-validator',
        validate: () => ({
          issues: [
            {
              message: 'Expected email',
              path: [{ key: 'users' }, { key: '0' }, { key: 'email' }],
            },
          ],
        }),
      },
    };

    expect(() => validateWithSchema(legacyPathSchema, {}, 'payload')).toThrow(
      'Validation failed: payload.users.0.email: Expected email'
    );
  });

  it('should accept legacy schemas with optional ~standard.types metadata', () => {
    const legacySchemaWithTypes: StandardSchemaV1<string, number> = {
      '~standard': {
        version: 1,
        vendor: 'legacy-validator',
        types: {
          input: '' as string,
          output: 0 as number,
        },
        validate: (value: unknown) => ({
          value: Number(value),
        }),
      },
    };

    expect(isStandardSchema(legacySchemaWithTypes)).toBe(true);
    expect(validateWithSchema(legacySchemaWithTypes, '42', 'value')).toBe(42);
  });
});
