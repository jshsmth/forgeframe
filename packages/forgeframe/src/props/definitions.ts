/**
 * @packageDocumentation
 * Shared prop-definition constants.
 */

import type { PropsDefinition } from "../types/props";

/**
 * Shared empty prop-definition map for components without custom props.
 * @internal
 */
export const EMPTY_PROP_DEFINITIONS = /* @__PURE__ */ Object.freeze(
	{},
) as PropsDefinition<Record<string, unknown>>;
