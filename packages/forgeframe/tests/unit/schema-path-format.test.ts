/**
 * Formatting tests for schema issue paths in `validateWithSchema`.
 *
 * Covers mixed key/index path rendering and resilience to malformed path segment payloads.
 */
import { describe, expect, it } from 'vitest';
import { validateWithSchema, type StandardSchemaV1 } from '#internal/props/schema';

describe('validateWithSchema path formatting', () => {
  it('should format mixed key/index path segments', () => {
    const schema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({
          issues: [
            {
              message: 'Invalid email',
              path: ['users', { index: 1 }, { key: 'email' }],
            },
          ],
        }),
      },
    };

    expect(() => validateWithSchema(schema, {}, 'payload')).toThrow(
      'Validation failed: payload.users.1.email: Invalid email'
    );
  });

  it('should not crash on malformed path segments', () => {
    const schema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({
          issues: [
            {
              message: 'Invalid value',
              path: [
                { key: 'users' },
                { index: 1 },
                { invalid: true } as unknown as {
                  key?: PropertyKey;
                  index?: number;
                },
              ],
            },
          ],
        }),
      },
    };

    expect(() => validateWithSchema(schema, {}, 'payload')).toThrow(
      'Validation failed: payload.users.1.[object Object]: Invalid value'
    );
  });
});
