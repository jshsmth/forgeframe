/**
 * @packageDocumentation
 * Host component implementation module.
 *
 * @remarks
 * This module exposes the public host-side runtime entrypoints while the
 * concrete bootstrap, security, props, and transport concerns live in
 * focused internal modules under `src/core/host/`.
 */

import { hasBrowserWindow } from "../utils/browser";
import { isForgeFrameWindow } from "../window/name-payload";
import { getHost as getActiveHost } from "./host/bootstrap";

export {
	clearHostInstance,
	getHost,
	initHost,
} from "./host/bootstrap";
export { HostComponent } from "./host/component";

/**
 * Checks whether this window carries ForgeFrame channel metadata.
 *
 * @remarks
 * A "host" in ForgeFrame terminology is the embedded iframe or popup window
 * that receives props from the consumer (the embedding app). This reads only
 * the channel metadata's prefix in `window.name`, so it stays true for
 * malformed metadata, where `initHost()` returns `null`, and after
 * `host.destroy()`, because the metadata is kept for reconnection. Use it to
 * choose between embedded and standalone rendering before calling
 * `initHost()`.
 *
 * @returns True if this window carries ForgeFrame channel metadata or runs an
 * active host
 *
 * @example
 * ```typescript
 * import { initHost, isHost } from 'forgeframe';
 *
 * if (isHost()) {
 *   const host = initHost(MyComponent, { consumerOrigins: 'https://app.example.com' });
 * } else {
 *   renderStandalone();
 * }
 * ```
 *
 * @public
 */
export function isHost(): boolean {
	if (!hasBrowserWindow()) return false;
	return getActiveHost() !== null || isForgeFrameWindow();
}
