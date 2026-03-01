/**
 * Contract tests for third-party Standard Schema interoperability.
 *
 * Covers Zod and Valibot compatibility, typed input/output behavior, and normalized issue path preservation.
 */
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { z } from 'zod';
import {
  isStandardSchema,
  validateWithSchema,
  type StandardSchemaV1,
  type StandardSchemaV1PathSegment,
} from '@/props/schema';

type StandardSchemaPath = PropertyKey | StandardSchemaV1PathSegment;

/**
 * Normalizes third-party issue path segments into the Standard Schema path shape.
 */
function normalizeIssuePath(
  path: readonly unknown[] | undefined
): ReadonlyArray<StandardSchemaPath> | undefined {
  if (!path || path.length === 0) {
    return undefined;
  }

  return path.map((segment) => {
    if (
      typeof segment === 'string' ||
      typeof segment === 'number' ||
      typeof segment === 'symbol'
    ) {
      return segment;
    }

    if (typeof segment === 'object' && segment !== null) {
      const pathSegment = segment as { key?: unknown; index?: unknown };

      if (typeof pathSegment.index === 'number') {
        return { index: pathSegment.index };
      }

      if (typeof pathSegment.key === 'number') {
        return { index: pathSegment.key };
      }

      if (
        typeof pathSegment.key === 'string' ||
        typeof pathSegment.key === 'symbol'
      ) {
        return { key: pathSegment.key };
      }
    }

    return String(segment);
  });
}

/**
 * Wraps a Zod schema with a Standard Schema-compatible validation contract.
 */
function createZodStandardSchema<Output>(
  schema: z.ZodType<Output>
): StandardSchemaV1<unknown, Output> {
  return {
    '~standard': {
      version: 1,
      vendor: 'zod',
      validate: (value: unknown) => {
        const result = schema.safeParse(value);

        if (result.success) {
          return { value: result.data };
        }

        return {
          issues: result.error.issues.map((issue) => ({
            message: issue.message,
            path: normalizeIssuePath(issue.path),
            code: issue.code,
            input: (issue as { input?: unknown }).input,
          })),
        };
      },
    },
  };
}

/**
 * Wraps a Valibot schema with a Standard Schema-compatible validation contract.
 */
function createValibotStandardSchema<
  TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(
  schema: TSchema
): StandardSchemaV1<unknown, v.InferOutput<TSchema>> {
  return {
    '~standard': {
      version: 1,
      vendor: 'valibot',
      validate: (value: unknown) => {
        const result = v.safeParse(schema, value);

        if (result.success) {
          return { value: result.output };
        }

        return {
          issues: result.issues.map((issue) => ({
            message: issue.message,
            path: normalizeIssuePath(issue.path),
            code: issue.type,
            input: issue.input,
          })),
        };
      },
    },
  };
}

describe('schema contracts with real schema libraries', () => {
  const zodAdapter = createZodStandardSchema(
    z.object({
      users: z.array(
        z.object({
          email: z.string().email(),
        })
      ),
    })
  );

  const valibotAdapter = createValibotStandardSchema(
    v.object({
      users: v.array(
        v.object({
          email: v.pipe(v.string(), v.email()),
        })
      ),
    })
  );

  const contracts: ReadonlyArray<{
    name: string;
    schema: StandardSchemaV1<
      unknown,
      { users: ReadonlyArray<{ email: string }> }
    >;
  }> = [
    {
      name: 'zod adapter',
      schema: zodAdapter,
    },
    {
      name: 'valibot adapter',
      schema: valibotAdapter,
    },
  ];

  describe.each(contracts)('$name', ({ schema }) => {
    it('should be recognized by isStandardSchema', () => {
      expect(isStandardSchema(schema)).toBe(true);
    });

    it('should validate valid data', () => {
      const result = validateWithSchema(
        schema,
        { users: [{ email: 'user@example.com' }] },
        'payload'
      );

      expect(result.users[0]?.email).toBe('user@example.com');
    });

    it('should preserve nested error paths with array indexes', () => {
      expect(() =>
        validateWithSchema(
          schema,
          { users: [{ email: 'not-an-email' }] },
          'payload'
        )
      ).toThrow('Validation failed: payload.users.0.email');
    });
  });
});
