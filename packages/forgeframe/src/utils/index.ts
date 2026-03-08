/**
 * Utility functions and classes for ForgeFrame.
 *
 * @remarks
 * This module provides common utilities used throughout the ForgeFrame framework:
 * - **UID generation**: Functions for creating unique identifiers
 * - **Cleanup management**: A class for managing resource disposal
 * - **Promise utilities**: Helpers for working with async operations
 *
 * @example
 * ```typescript
 * import {
 *   generateUID,
 *   CleanupManager,
 *   createDeferred,
 *   delay
 * } from './utils';
 *
 * // Generate a unique ID
 * const id = generateUID();
 *
 * // Manage cleanup tasks
 * const cleanup = new CleanupManager();
 * cleanup.register(() => console.log('Cleaning up...'));
 *
 * // Work with deferred promises
 * const deferred = createDeferred<string>();
 * setTimeout(() => deferred.resolve('done'), 1000);
 * await deferred.promise;
 * ```
 *
 * @packageDocumentation
 */

export { generateUID, generateShortUID, isValidUID } from '#internal/utils/uid';
export { CleanupManager } from '#internal/utils/cleanup';
export {
  createDeferred,
  promiseTimeout,
  waitFor,
  delay,
  tryCatch,
  type Deferred,
} from '#internal/utils/promise';
export { normalizeDimensionToCSS, normalizeDimensionToNumber } from '#internal/utils/dimension';
