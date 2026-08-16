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
} from '../types/props';
import type { DomainMatcher } from '../types/utility';
import { BUILTIN_PROP_DEFINITIONS } from './definitions';
import { matchDomain } from '../window/helpers';
import { isStandardSchema, validateWithSchema } from './schema';

function resolvePropDefinition<P>(
  def: unknown
): { isDirectSchema: boolean; definition: PropDefinition<unknown, P> } {
  const isDirectSchema = isStandardSchema(def);
  const definition = isDirectSchema
    ? ({ schema: def } as PropDefinition<unknown, P>)
    : (def as PropDefinition<unknown, P>);

  return { isDirectSchema, definition };
}

interface CompiledPropDefinition<P extends Record<string, unknown>> {
  key: string;
  isDirectSchema: boolean;
  definition: PropDefinition<unknown, P>;
}

interface PropAliasEdge {
  canonicalKey: string;
  aliasKey: string;
}

const compiledPropDefinitionsCache = new WeakMap<
  object,
  readonly CompiledPropDefinition<Record<string, unknown>>[]
>();

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

function getCompiledPropDefinitions<P extends Record<string, unknown>>(
  definitions: PropsDefinition<P>
): readonly CompiledPropDefinition<P>[] {
  const cacheKey = definitions as object;
  const cached = compiledPropDefinitionsCache.get(cacheKey) as
    | readonly CompiledPropDefinition<P>[]
    | undefined;
  if (cached) {
    return cached;
  }

  const compiledDefinitions = Object.entries({
    ...BUILTIN_PROP_DEFINITIONS,
    ...definitions,
  }).map(([key, def]) => {
    const { isDirectSchema, definition } = resolvePropDefinition<P>(def);
    return {
      key,
      isDirectSchema,
      definition,
    };
  });

  compiledPropDefinitionsCache.set(
    cacheKey,
    compiledDefinitions as readonly CompiledPropDefinition<Record<string, unknown>>[]
  );

  return compiledDefinitions;
}

/**
 * Rewrites aliases in an incoming prop patch to their canonical prop keys.
 *
 * @remarks
 * Alias materialization must happen before a patch is merged with the current
 * normalized props. Otherwise an older canonical value would take precedence
 * over a newer value supplied through its alias. When a patch contains both
 * spellings, the canonical key wins unless it only contains the driver's
 * synthetic reset marker and the alias contains a concrete value. Aliases that
 * reference another canonical prop are resolved transitively.
 *
 * @param props - Incoming initial props or update patch.
 * @param definitions - Prop definitions containing canonical keys and aliases.
 * @param resetValue - Optional internal marker used to distinguish omission resets.
 *
 * @internal
 */
export function materializePropAliases<P extends Record<string, unknown>>(
  props: Record<string, unknown>,
  definitions: PropsDefinition<P>,
  resetValue?: unknown
): Partial<P> {
  const source = props as Record<string, unknown>;
  const result = { ...source } as Record<string, unknown>;
  const compiledDefinitions = getCompiledPropDefinitions(definitions);
  const canonicalKeys = new Set(
    compiledDefinitions.map(({ key }) => key)
  );
  const aliasEdges = compiledDefinitions.flatMap<PropAliasEdge>(
    ({ key, definition }) => {
      const aliasKey = definition.alias;
      return aliasKey && aliasKey !== key
        ? [{ canonicalKey: key, aliasKey }]
        : [];
    }
  );

  // Each pass can advance a value by at least one alias edge. Bounding the
  // passes by the edge count supports chains while guaranteeing cyclic alias
  // definitions terminate.
  for (let pass = 0; pass < aliasEdges.length; pass += 1) {
    let changed = false;

    for (const { canonicalKey, aliasKey } of aliasEdges) {
      const canonicalIsReset =
        resetValue !== undefined &&
        hasOwn(source, canonicalKey) &&
        source[canonicalKey] === resetValue;
      const hasAliasValue = hasOwn(result, aliasKey);
      const aliasValue = result[aliasKey];
      const aliasIsConcrete = hasAliasValue && aliasValue !== resetValue;

      if (
        (!hasOwn(source, canonicalKey) ||
          (canonicalIsReset && aliasIsConcrete)) &&
        hasAliasValue &&
        (!hasOwn(result, canonicalKey) ||
          !Object.is(result[canonicalKey], aliasValue))
      ) {
        result[canonicalKey] = aliasValue;
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  for (const { aliasKey } of aliasEdges) {
    // Preserve an alias key that is also a separately defined canonical prop.
    if (!canonicalKeys.has(aliasKey)) {
      Reflect.deleteProperty(result, aliasKey);
    }
  }

  return result as Partial<P>;
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
  const result = {} as P;

  for (const { key, definition } of getCompiledPropDefinitions(definitions)) {
    const propKey = key as keyof P;
    let value: unknown;

    const aliasKey = definition.alias;
    const hasValue = key in userProps;
    const hasAliasValue = aliasKey && aliasKey in userProps;

    if (hasValue) {
      value = userProps[propKey];
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
  for (const { key, isDirectSchema, definition } of getCompiledPropDefinitions(definitions)) {
    const propKey = key as keyof P;
    let value: unknown = props[propKey];

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
  const result: Partial<P> = {};

  for (const { key, definition } of getCompiledPropDefinitions(definitions)) {
    const propKey = key as keyof P;
    const value = props[propKey];

    if (!shouldSendPropToHost(definition, hostDomain, isSameDomain)) continue;

    let finalValue = value;
    if (definition.hostDecorate && value !== undefined) {
      finalValue = definition.hostDecorate({ value, props }) as P[keyof P];
    }

    (result as Record<string, unknown>)[key] = finalValue;
  }

  return result;
}

/**
 * Applies the delivery policy shared by postMessage, query-string, and POST
 * body transports.
 *
 * @internal
 */
function shouldSendPropToHost<P extends Record<string, unknown>>(
  definition: PropDefinition<unknown, P>,
  hostDomain: string,
  isSameDomain: boolean
): boolean {
  if (definition.sendToHost === false) return false;
  if (definition.sameDomain && !isSameDomain) return false;

  if (definition.trustedDomains) {
    const trusted = definition.trustedDomains as DomainMatcher;
    if (!matchDomain(trusted, hostDomain)) return false;
  }

  return true;
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
  definitions: PropsDefinition<P>,
  hostDomain: string,
  isSameDomain = false
): URLSearchParams {
  const params = new URLSearchParams();

  for (const { key, definition } of getCompiledPropDefinitions(definitions)) {
    const propKey = key as keyof P;
    const value = props[propKey];

    if (value === undefined) continue;
    if (typeof value === 'function') continue;
    if (!definition.queryParam) continue;
    if (!shouldSendPropToHost(definition, hostDomain, isSameDomain)) continue;

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
  definitions: PropsDefinition<P>,
  hostDomain: string,
  isSameDomain = false
): URLSearchParams {
  const params = new URLSearchParams();

  for (const { key, definition } of getCompiledPropDefinitions(definitions)) {
    const propKey = key as keyof P;
    const value = props[propKey];

    if (value === undefined) continue;
    if (typeof value === 'function') continue;
    if (!definition.bodyParam) continue;
    if (!shouldSendPropToHost(definition, hostDomain, isSameDomain)) continue;

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
