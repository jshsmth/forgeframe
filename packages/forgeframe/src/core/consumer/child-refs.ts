/**
 * @packageDocumentation
 * Consumer child-reference helper module.
 *
 * @remarks
 * Converts nested consumer child definitions into the serializable host
 * component references included in the consumer window payload.
 */

import type { HostComponentRef } from '../../window/types';
import type { PropsDefinition } from '../../types/props';
import { getComponentOptions } from '../component-registry';
import type { NormalizedOptions } from './types';

/**
 * Builds component references for nested host components.
 * @internal
 */
export function buildNestedHostRefs<
  P extends Record<string, unknown>,
  SchemaInputs,
>(
  options: Pick<NormalizedOptions<P, SchemaInputs>, 'children'>,
  props: P
): Record<string, HostComponentRef> | undefined {
  if (!options.children) {
    return undefined;
  }

  const nestedComponents = options.children({ props });
  const refs: Record<string, HostComponentRef> = {};

  for (const [name, component] of Object.entries(nestedComponents)) {
    const nestedOptions = getComponentOptions(component);
    if (!nestedOptions) {
      throw new Error(`Nested component "${name}" is missing component metadata`);
    }

    if (typeof nestedOptions.url !== 'string') {
      throw new Error(
        `Nested component "${name}" must use a static string URL for protocol-v1 compatibility.`
      );
    }

    refs[name] = {
      tag: nestedOptions.tag,
      url: nestedOptions.url,
      props: nestedOptions.props as PropsDefinition<Record<string, unknown>> | undefined,
      dimensions:
        typeof nestedOptions.dimensions === 'function' ? undefined : nestedOptions.dimensions,
      defaultContext: nestedOptions.defaultContext,
    };
  }

  return Object.keys(refs).length > 0 ? refs : undefined;
}
