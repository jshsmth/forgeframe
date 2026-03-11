/**
 * @packageDocumentation
 * Internal source barrel for framework integrations.
 *
 * @remarks
 * This file keeps the driver modules organized inside the source tree.
 * The published package does not expose a `forgeframe/drivers` subpath;
 * consumers should import the public React driver APIs from `forgeframe`.
 *
 * @example
 * ```typescript
 * import { createReactComponent, withReactComponent } from 'forgeframe';
 * import type { ReactDriverOptions, ReactComponentProps } from 'forgeframe';
 * ```
 */

export {
  createReactComponent,
  withReactComponent,
  type ReactDriverOptions,
  type ReactComponentProps,
  type ReactComponentType,
} from './react';
