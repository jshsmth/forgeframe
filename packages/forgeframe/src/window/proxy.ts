import type { WindowRef } from './types';
import { getConsumer, getOpener, getAncestor, isWindowClosed } from './helpers';

/**
 * Maximum number of windows to keep in the registry.
 * @internal
 */
const MAX_REGISTRY_SIZE = 100;

/**
 * Global storage for window references by UID.
 *
 * @remarks
 * This registry allows windows to be looked up by their unique identifier,
 * enabling cross-window communication even when direct references aren't available.
 *
 * @internal
 */
const windowRegistry = new Map<string, Window>();

/**
 * Cleans up closed windows from the registry to prevent memory leaks.
 *
 * @internal
 */
function cleanupClosedWindows(): void {
  const toDelete: string[] = [];

  for (const [uid, win] of windowRegistry.entries()) {
    if (isWindowClosed(win)) {
      toDelete.push(uid);
    }
  }

  for (const uid of toDelete) {
    windowRegistry.delete(uid);
  }
}

/**
 * Registers a window with a unique identifier for later retrieval.
 *
 * @param uid - The unique identifier for the window.
 * @param win - The window to register.
 *
 * @remarks
 * Registered windows can be retrieved later using {@link getWindowByUID}.
 * This is useful for maintaining references to windows across different contexts.
 *
 * The registry automatically cleans up closed windows when new windows are
 * registered to prevent memory leaks. A maximum of 100 windows can be
 * registered at a time.
 *
 * @example
 * ```typescript
 * const popup = window.open('https://example.com');
 * registerWindow('my-popup-123', popup);
 *
 * // Later, retrieve the window
 * const retrievedPopup = getWindowByUID('my-popup-123');
 * ```
 *
 * @public
 */
export function registerWindow(uid: string, win: Window): void {
  // Periodically clean up closed windows to prevent memory leaks
  if (windowRegistry.size >= MAX_REGISTRY_SIZE) {
    cleanupClosedWindows();
  }

  // If still at max after cleanup, remove oldest entry (FIFO)
  if (windowRegistry.size >= MAX_REGISTRY_SIZE) {
    const oldestKey = windowRegistry.keys().next().value;
    if (oldestKey) {
      windowRegistry.delete(oldestKey);
    }
  }

  windowRegistry.set(uid, win);
}

/**
 * Unregisters a window from the registry.
 *
 * @param uid - The unique identifier of the window to unregister.
 *
 * @remarks
 * Call this function when a window is closed or no longer needed to prevent memory leaks.
 *
 * @example
 * ```typescript
 * // When done with a popup
 * unregisterWindow('my-popup-123');
 * ```
 *
 * @public
 */
export function unregisterWindow(uid: string): void {
  windowRegistry.delete(uid);
}

/**
 * Retrieves a registered window by its unique identifier.
 *
 * @param uid - The unique identifier of the window to retrieve.
 * @returns The registered window, or `null` if not found.
 *
 * @remarks
 * Windows must be registered using {@link registerWindow} before they can be retrieved.
 *
 * @example
 * ```typescript
 * const popup = getWindowByUID('my-popup-123');
 * if (popup) {
 *   popup.postMessage({ type: 'hello' }, '*');
 * }
 * ```
 *
 * @public
 */
export function getWindowByUID(uid: string): Window | null {
  return windowRegistry.get(uid) ?? null;
}

/**
 * Creates a serializable reference to a target window.
 *
 * @param targetWin - The window to create a reference for.
 * @param sourceWin - The source window context. Defaults to the current window.
 * @returns A WindowRef object that describes how to reach the target window.
 *
 * @remarks
 * This function analyzes the relationship between the source and target windows
 * and creates an appropriate reference type:
 * - `opener`: Target is the source's opener (for popups)
 * - `parent`: Target is an ancestor in the frame hierarchy
 * - `direct`: Direct window reference (only works same-origin)
 *
 * The returned reference can be serialized for cross-window communication,
 * except for `direct` type which contains an actual Window object.
 *
 * @example
 * ```typescript
 * // Create a reference to the parent window
 * const parentRef = createWindowRef(window.parent);
 * console.log(parentRef); // { type: 'parent', distance: 1 }
 *
 * // Create a reference to the opener
 * const openerRef = createWindowRef(window.opener);
 * console.log(openerRef); // { type: 'opener' }
 * ```
 *
 * @public
 */
export function createWindowRef(
  targetWin: Window,
  sourceWin: Window = window
): WindowRef {
  const opener = getOpener(sourceWin);
  if (opener === targetWin) {
    return { type: 'opener' };
  }

  let consumer = getConsumer(sourceWin);
  let distance = 1;

  while (consumer) {
    if (consumer === targetWin) {
      return { type: 'parent', distance };
    }
    consumer = getConsumer(consumer);
    distance++;

    if (distance > 100) break;
  }

  return { type: 'direct', win: targetWin };
}

/**
 * Resolves a window reference to an actual Window object.
 *
 * @param ref - The window reference to resolve.
 * @param sourceWin - The source window context. Defaults to the current window.
 * @returns The resolved Window object, or `null` if resolution fails.
 *
 * @remarks
 * This function is the inverse of {@link createWindowRef}. It takes a WindowRef
 * and returns the actual Window object it references. Supports all reference types:
 * - `opener`: Returns the opener window
 * - `parent`: Returns the ancestor at the specified distance
 * - `global`: Looks up the window in the registry by UID
 * - `direct`: Returns the directly referenced window
 *
 * @example
 * ```typescript
 * // Resolve a consumer reference
 * const ref: WindowRef = { type: 'parent', distance: 1 };
 * const consumerWindow = resolveWindowRef(ref);
 *
 * // Resolve a global reference
 * const globalRef: WindowRef = { type: 'global', uid: 'my-popup-123' };
 * const popup = resolveWindowRef(globalRef);
 * ```
 *
 * @public
 */
export function resolveWindowRef(
  ref: WindowRef,
  sourceWin: Window = window
): Window | null {
  switch (ref.type) {
    case 'opener':
      return getOpener(sourceWin);

    case 'parent':
      return getAncestor(sourceWin, ref.distance);

    case 'global':
      return getWindowByUID(ref.uid);

    case 'direct':
      return ref.win;

    default:
      return null;
  }
}

/**
 * Serializes a window reference for cross-domain transfer.
 *
 * @param ref - The window reference to serialize.
 * @returns The serialized window reference.
 * @throws Error if the reference is a `direct` type, which cannot be serialized.
 *
 * @remarks
 * Direct window references contain actual Window objects which cannot be
 * transferred via postMessage. Convert direct references to global references
 * using {@link registerWindow} before serialization.
 *
 * @example
 * ```typescript
 * // This works - parent reference is serializable
 * const parentRef: WindowRef = { type: 'parent', distance: 1 };
 * const serialized = serializeWindowRef(parentRef);
 *
 * // This throws - direct references are not serializable
 * const directRef: WindowRef = { type: 'direct', win: someWindow };
 * serializeWindowRef(directRef); // Error!
 * ```
 *
 * @public
 */
export function serializeWindowRef(ref: WindowRef): WindowRef {
  if (ref.type === 'direct') {
    throw new Error(
      'Cannot serialize direct window reference. Use registerWindow first.'
    );
  }
  return ref;
}

/**
 * Clears all registered windows from the registry.
 *
 * @remarks
 * This function removes all window entries from the global registry.
 * Primarily useful for cleanup during testing or when resetting application state.
 *
 * @example
 * ```typescript
 * // In a test teardown
 * afterEach(() => {
 *   clearWindowRegistry();
 * });
 * ```
 *
 * @public
 */
export function clearWindowRegistry(): void {
  windowRegistry.clear();
}
