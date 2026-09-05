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
 *   createDeferred
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

export { generateUID, generateShortUID } from './uid';
export { CleanupManager } from './cleanup';
export {
  createDeferred,
  promiseTimeout,
  type Deferred,
} from './promise';
export { normalizeDimensionToCSS, normalizeDimensionToNumber } from './dimension';
