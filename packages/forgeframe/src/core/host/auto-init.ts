/**
 * @packageDocumentation
 * Internal root-entrypoint host pre-initialization helper.
 *
 * @remarks
 * Keeps root import-time host setup colocated with the host bootstrap
 * internals instead of mixing it into the public package entrypoint.
 */

import { hasBrowserWindow } from '../../utils/browser';
import { initHost } from './bootstrap';

/**
 * Pre-initializes host state when the public root entrypoint is imported in a
 * browser window.
 *
 * @remarks
 * INIT remains deferred until `initHost()` is explicitly flushed or a host
 * component definition does so.
 *
 * @internal
 */
export function preinitHostOnImport(): void {
  if (!hasBrowserWindow()) {
    return;
  }

  initHost(undefined, undefined, { deferInit: true });
}
