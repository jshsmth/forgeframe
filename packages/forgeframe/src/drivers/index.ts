/**
 * ForgeFrame Framework Integration Module
 *
 * @remarks
 * This module provides framework-specific integrations for ForgeFrame
 * components with popular UI frameworks like React. These handle the lifecycle
 * management, prop synchronization, and rendering of cross-domain components
 * within the target framework's component model.
 *
 * @example
 * ```typescript
 * import { createReactComponent, withReactComponent } from 'forgeframe/drivers';
 * import type { ReactDriverOptions, ReactComponentProps } from 'forgeframe/drivers';
 * ```
 *
 * @packageDocumentation
 */

export {
  createReactComponent,
  withReactComponent,
  type ReactDriverOptions,
  type ReactComponentProps,
  type ReactComponentType,
} from '@/drivers/react';
