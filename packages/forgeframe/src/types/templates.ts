/**
 * Shared public render template types.
 */

import type { ContextType } from '../constants';
import type { Dimensions } from './utility';

/**
 * Context object passed to container and prerender template functions.
 *
 * @typeParam P - The props type for the component
 *
 * @public
 */
export interface TemplateContext<P = Record<string, unknown>> {
  /** Unique instance identifier */
  uid: string;
  /** Component tag name */
  tag: string;
  /** Rendering context (iframe or popup) */
  context: ContextType;
  /** Component dimensions */
  dimensions: Dimensions;
  /** Current props */
  props: P;
  /** Document object for creating elements */
  doc: Document;
  /** Container element */
  container: HTMLElement;
  /** The iframe element (null for popup context) */
  frame: HTMLIFrameElement | null;
  /** The prerender/loading element (from prerenderTemplate) */
  prerenderFrame: HTMLElement | null;
  /** Close the component */
  close: () => Promise<void>;
  /** Focus the component */
  focus: () => Promise<void>;
}

/**
 * Function that creates a custom container element for the component.
 *
 * @typeParam P - The props type for the component
 *
 * @param ctx - Template context with component info
 * @returns The container element or null to use default
 *
 * @public
 */
export type ContainerTemplate<P = Record<string, unknown>> = (
  ctx: TemplateContext<P>
) => HTMLElement | null;

/**
 * Function that creates a custom prerender (loading) element.
 *
 * @typeParam P - The props type for the component
 *
 * @param ctx - Template context with component info
 * @returns The prerender element or null for no prerender
 *
 * @public
 */
export type PrerenderTemplate<P = Record<string, unknown>> = (
  ctx: TemplateContext<P>
) => HTMLElement | null;
