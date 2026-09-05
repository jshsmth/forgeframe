/**
 * @packageDocumentation
 * Built-in prop definitions for ForgeFrame components.
 *
 * @remarks
 * This module defines the standard props that are automatically available
 * to all ForgeFrame components, including identifiers, dimensions, and
 * lifecycle callbacks.
 */

import type { PropDefinition, PropsDefinition } from '../types/props';
import type { Dimensions } from '../types/utility';
import { prop } from './prop';

/**
 * Built-in props that are automatically provided to all components.
 *
 * @remarks
 * These props are always available regardless of the component's prop definitions.
 * They include component identifiers, dimensions, timeouts, and lifecycle callbacks.
 *
 * @public
 */
export interface BuiltinProps {
  /** Unique component instance identifier. */
  uid: string;

  /** Component tag name. */
  tag: string;

  /** Component dimensions. */
  dimensions: Dimensions;

  /** Initialization timeout in milliseconds. */
  timeout: number;

  /** CSP nonce for inline scripts/styles. */
  cspNonce?: string;

  /** Called when component becomes visible. */
  onDisplay?: () => void;

  /** Called when component is fully rendered. */
  onRendered?: () => void;

  /** Called when rendering starts. */
  onRender?: () => void;

  /** Called when prerender phase completes. */
  onPrerendered?: () => void;

  /** Called when prerender phase starts. */
  onPrerender?: () => void;

  /** Called when component is closing. */
  onClose?: () => void;

  /** Called when component is destroyed. */
  onDestroy?: () => void;

  /** Called when component is resized. */
  onResize?: (dimensions: Dimensions) => void;

  /** Called when component receives focus. */
  onFocus?: () => void;

  /** Called when an error occurs. */
  onError?: (err: Error) => void;

  /** Called when props are updated. */
  onProps?: (props: Record<string, unknown>) => void;
}

/**
 * Shared empty prop-definition map for components without custom props.
 * @internal
 */
export const EMPTY_PROP_DEFINITIONS =
  /* @__PURE__ */ Object.freeze({}) as PropsDefinition<Record<string, unknown>>;

/**
 * Default prop definitions for all built-in props.
 *
 * @remarks
 * These definitions specify the type, required status, and default values
 * for built-in props.
 *
 * @public
 */
export const BUILTIN_PROP_DEFINITIONS: Record<string, PropDefinition> =
  /* @__PURE__ */ createBuiltinPropDefinitions();

// Keep schema initialization in a named pure call so consumer bundlers can drop
// it when only importing helpers such as isHost from the built ESM entrypoint.
function createBuiltinPropDefinitions(): Record<string, PropDefinition> {
  return {
    uid: {
      schema: prop.string().optional(),
      sendToHost: true,
    },

    tag: {
      schema: prop.string().optional(),
      sendToHost: true,
    },

    dimensions: {
      schema: prop.object<Dimensions>().default(() => ({ width: '100%', height: '100%' })),
      sendToHost: false,
    },

    timeout: {
      schema: prop.number().default(10000),
      sendToHost: false,
    },

    cspNonce: {
      schema: prop.string().optional(),
      sendToHost: true,
    },

    // Lifecycle callbacks - not sent to host (consumer-only)
    onDisplay: {
      schema: prop.function().optional(),
      sendToHost: false,
    },

    onRendered: {
      schema: prop.function().optional(),
      sendToHost: false,
    },

    onRender: {
      schema: prop.function().optional(),
      sendToHost: false,
    },

    onPrerendered: {
      schema: prop.function().optional(),
      sendToHost: false,
    },

    onPrerender: {
      schema: prop.function().optional(),
      sendToHost: false,
    },

    onClose: {
      schema: prop.function().optional(),
      sendToHost: false,
    },

    onDestroy: {
      schema: prop.function().optional(),
      sendToHost: false,
    },

    onResize: {
      schema: prop.function().optional(),
      sendToHost: false,
    },

    onFocus: {
      schema: prop.function().optional(),
      sendToHost: false,
    },

    onError: {
      schema: prop.function().optional(),
      sendToHost: false,
    },

    onProps: {
      schema: prop.function().optional(),
      sendToHost: false,
    },
  };
}
