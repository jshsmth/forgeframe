/**
 * @packageDocumentation
 * Props normalization and validation module.
 *
 * @remarks
 * This module handles merging user props with defaults, validating prop
 * types, and filtering props for sending to host components.
 */

import type {
  PropDefinition,
  PropsDefinition,
  PropContext,
  DomainMatcher,
} from '@/types';
import { BUILTIN_PROP_DEFINITIONS } from '@/props/definitions';
import { matchDomain } from '@/window/helpers';
import { isStandardSchema, validateWithSchema } from '@/props/schema';

function resolvePropDefinition<P>(
  def: unknown
): { isDirectSchema: boolean; definition: PropDefinition<unknown, P> } {
  const isDirectSchema = isStandardSchema(def);
  const definition = isDirectSchema
    ? ({ schema: def } as PropDefinition<unknown, P>)
    : (def as PropDefinition<unknown, P>);

  return { isDirectSchema, definition };
}

/**
 * Merges user props with defaults and computes derived values.
 *
 * @typeParam P - The props type
 * @param userProps - Props provided by the user
 * @param definitions - Prop definitions from component config
 * @param context - Context for computed props
 * @returns Normalized props object
 *
 * @public
 */
export function normalizeProps<P extends Record<string, unknown>>(
  userProps: Partial<P>,
  definitions: PropsDefinition<P>,
  context: PropContext<P>
): P {
  const allDefs = {
    ...BUILTIN_PROP_DEFINITIONS,
    ...definitions,
  } as PropsDefinition<P>;

  const result = {} as P;

  for (const [key, def] of Object.entries(allDefs)) {
    const { definition } = resolvePropDefinition<P>(def);
    let value: unknown;

    const aliasKey = definition.alias;
    const hasValue = key in userProps;
    const hasAliasValue = aliasKey && aliasKey in userProps;

    if (hasValue) {
      value = userProps[key as keyof P];
    } else if (hasAliasValue) {
      value = userProps[aliasKey as keyof P];
    } else if (definition.value) {
      value = definition.value(context);
    } else if (definition.default !== undefined) {
      value =
        typeof definition.default === 'function'
          ? (definition.default as (ctx: PropContext<P>) => unknown)(context)
          : definition.default;
    } else if (definition.schema && isStandardSchema(definition.schema)) {
      // Check if schema provides a default by validating undefined
      // This allows prop.string().default('value') to work in normalizeProps
      const schemaResult = definition.schema['~standard'].validate(undefined);
      if (!(schemaResult instanceof Promise) && !schemaResult.issues) {
        value = schemaResult.value;
      }
    }

    if (value !== undefined && definition.decorate) {
      value = definition.decorate({ value, props: result as P });
    }

    (result as Record<string, unknown>)[key] = value;
  }

  return result;
}

/**
 * Validates props against their definitions.
 *
 * @typeParam P - The props type
 * @param props - Props to validate
 * @param definitions - Prop definitions to validate against
 * @throws Error if a required prop is missing or type is invalid
 *
 * @public
 */
export function validateProps<P extends Record<string, unknown>>(
  props: P,
  definitions: PropsDefinition<P>
): void {
  const allDefs = {
    ...BUILTIN_PROP_DEFINITIONS,
    ...definitions,
  } as PropsDefinition<P>;

  for (const [key, def] of Object.entries(allDefs)) {
    const { isDirectSchema, definition } = resolvePropDefinition<P>(def);
    let value: unknown = props[key as keyof P];

    if (definition.required && value === undefined) {
      throw new Error(`Prop "${key}" is required but was not provided`);
    }

    // Validate using schema (handles type checking, defaults, and optional)
    if (definition.schema && isStandardSchema(definition.schema)) {
      // Direct schemas handle undefined via .optional() and .default()
      if (value !== undefined || isDirectSchema) {
        value = validateWithSchema(definition.schema, value, key);
        (props as Record<string, unknown>)[key] = value;
      }
    } else if (value === undefined) {
      continue;
    }

    if (definition.validate) {
      definition.validate({ value, props });
    }
  }
}

/**
 * Filters props for sending to the host component.
 *
 * @remarks
 * Respects sendToHost, sameDomain, and trustedDomains settings.
 *
 * @typeParam P - The props type
 * @param props - All props
 * @param definitions - Prop definitions
 * @param hostDomain - The host's domain
 * @param isSameDomain - Whether host is same domain as consumer
 * @returns Filtered props for the host
 *
 * @public
 */
export function getPropsForHost<P extends Record<string, unknown>>(
  props: P,
  definitions: PropsDefinition<P>,
  hostDomain: string,
  isSameDomain: boolean
): Partial<P> {
  const allDefs = {
    ...BUILTIN_PROP_DEFINITIONS,
    ...definitions,
  } as PropsDefinition<P>;

  const result: Partial<P> = {};

  for (const [key, def] of Object.entries(allDefs)) {
    const { definition } = resolvePropDefinition<P>(def);
    const value = props[key as keyof P];

    if (definition.sendToHost === false) continue;
    if (definition.sameDomain && !isSameDomain) continue;

    if (definition.trustedDomains) {
      const trusted = definition.trustedDomains as DomainMatcher;
      if (!matchDomain(trusted, hostDomain)) continue;
    }

    let finalValue = value;
    if (definition.hostDecorate && value !== undefined) {
      finalValue = definition.hostDecorate({ value, props }) as P[keyof P];
    }

    (result as Record<string, unknown>)[key] = finalValue;
  }

  return result;
}

/**
 * Builds URL query parameters from props with queryParam option.
 *
 * @typeParam P - The props type
 * @param props - Props to convert
 * @param definitions - Prop definitions
 * @returns URLSearchParams with query parameters
 *
 * @public
 */
export function propsToQueryParams<P extends Record<string, unknown>>(
  props: P,
  definitions: PropsDefinition<P>
): URLSearchParams {
  const params = new URLSearchParams();
  const allDefs = {
    ...BUILTIN_PROP_DEFINITIONS,
    ...definitions,
  } as PropsDefinition<P>;

  for (const [key, def] of Object.entries(allDefs)) {
    const { definition } = resolvePropDefinition<P>(def);
    const value = props[key as keyof P];

    if (value === undefined) continue;
    if (typeof value === 'function') continue;
    if (!definition.queryParam) continue;

    const paramName =
      typeof definition.queryParam === 'string' ? definition.queryParam : key;

    let paramValue: string;
    if (typeof definition.queryParam === 'function') {
      paramValue = definition.queryParam({ value });
    } else if (typeof value === 'object') {
      paramValue = JSON.stringify(value);
    } else {
      paramValue = String(value);
    }

    params.set(paramName, paramValue);
  }

  return params;
}

/**
 * Builds POST body parameters from props with bodyParam option.
 *
 * @typeParam P - The props type
 * @param props - Props to convert
 * @param definitions - Prop definitions
 * @returns URLSearchParams with body parameters
 *
 * @public
 */
export function propsToBodyParams<P extends Record<string, unknown>>(
  props: P,
  definitions: PropsDefinition<P>
): URLSearchParams {
  const params = new URLSearchParams();
  const allDefs = {
    ...BUILTIN_PROP_DEFINITIONS,
    ...definitions,
  } as PropsDefinition<P>;

  for (const [key, def] of Object.entries(allDefs)) {
    const { definition } = resolvePropDefinition<P>(def);
    const value = props[key as keyof P];

    if (value === undefined) continue;
    if (typeof value === 'function') continue;
    if (!definition.bodyParam) continue;

    const paramName =
      typeof definition.bodyParam === 'string' ? definition.bodyParam : key;

    let paramValue: string;
    if (typeof definition.bodyParam === 'function') {
      paramValue = definition.bodyParam({ value });
    } else if (typeof value === 'object') {
      paramValue = JSON.stringify(value);
    } else {
      paramValue = String(value);
    }

    params.set(paramName, paramValue);
  }

  return params;
}
