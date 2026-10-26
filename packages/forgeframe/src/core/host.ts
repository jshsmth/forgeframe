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
 * Checks whether this window is, or is meant to be, a ForgeFrame host.
 *
 * @remarks
 * A "host" in ForgeFrame terminology is the embedded iframe or popup window
 * that receives props from the consumer (the embedding app). This returns
 * true when a host runtime is active in this window, or when `window.name`
 * holds a decodable ForgeFrame payload of any protocol version. A payload
 * from an older or newer ForgeFrame counts, so the page reaches `initHost()`
 * and its "upgrade both" error instead of rendering standalone.
 *
 * It returns false outside a browser, and for a name that has the ForgeFrame
 * prefix but no valid payload. It stays true after `host.destroy()`, because
 * the channel metadata is kept for a re-start. Use it to choose between
 * embedded and standalone rendering before calling `initHost()`. `initHost()`
 * can still return `null` when this returns true, for example for a stale
 * payload in a top-level window with no parent or opener, so check its
 * result as well.
 *
 * @returns True if a host runtime is active or this window carries a
 * decodable ForgeFrame payload
 *
 * @example
 * ```typescript
 * import { initHost, isHost } from 'forgeframe';
 *
 * const host = isHost()
 *   ? initHost(MyComponent, { consumerOrigins: 'https://app.example.com' })
 *   : null;
 * if (host) {
 *   const props = await host.ready;
 *   renderEmbedded(props);
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
