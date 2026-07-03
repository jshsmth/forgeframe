/**
 * Internal window/bootstrap wire contracts.
 */

import type { ConsumerExports } from '../communication/types';
import type { ContextType } from '../constants';
import type { SerializedProps } from '../props/types';
import type { PropsDefinition } from '../types/props';
import type { Dimensions } from '../types/utility';

/**
 * Serializable reference to a host component for cross-domain transfer.
 *
 * @internal
 */
export interface HostComponentRef {
  /** Component tag name */
  tag: string;
  /** Component URL */
  url: string;
  /** Prop definitions */
  props?: PropsDefinition<Record<string, unknown>>;
  /** Default dimensions */
  dimensions?: Dimensions;
  /** Default rendering context */
  defaultContext?: ContextType;
}

/**
 * Payload encoded in window.name for initial consumer-to-host data transfer.
 *
 * @typeParam _P - The props type (unused, for compatibility)
 *
 * @internal
 */
export interface WindowNamePayload<_P = Record<string, unknown>> {
  /** Consumer component instance UID */
  uid: string;
  /** Component tag name */
  tag: string;
  /** ForgeFrame version */
  version: string;
  /** Stable ForgeFrame wire protocol version */
  protocolVersion?: number;
  /** Rendering context */
  context: ContextType;
  /** Consumer window domain */
  consumerDomain: string;
  /** Serialized props */
  props: SerializedProps;
  /** Consumer method message names */
  exports: ConsumerExports;
  /** Nested component references */
  children?: Record<string, HostComponentRef>;
}

/**
 * Reference to a window for cross-domain communication.
 *
 * @internal
 */
export type WindowRef =
  | { type: 'opener' }
  | { type: 'parent'; distance: number }
  | { type: 'global'; uid: string }
  | { type: 'direct'; win: Window };
