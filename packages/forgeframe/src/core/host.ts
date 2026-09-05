/**
 * @packageDocumentation
 * Host component implementation module.
 *
 * @remarks
 * This module exposes the public host-side runtime entrypoints while the
 * concrete bootstrap, security, props, and transport concerns live in
 * focused internal modules under `src/core/host/`.
 */

import type { HostProps } from "../types/runtime";
import { isForgeFrameWindow } from "../window/name-payload";
import { getHost as getActiveHost } from "./host/bootstrap";

export {
	clearHostInstance,
	getHost,
	initHost,
} from "./host/bootstrap";
export { HostComponent } from "./host/component";

/**
 * Checks if the current window is a ForgeFrame host context.
 *
 * @remarks
 * A "host" in ForgeFrame terminology is the embedded iframe or popup window
 * that receives props from the consumer (the embedding app).
 *
 * @returns True if running inside a ForgeFrame iframe or popup
 *
 * @example
 * ```typescript
 * if (isHost()) {
 *   console.log('Running in ForgeFrame host');
 * }
 * ```
 *
 * @public
 */
export function isHost(): boolean {
	return getActiveHost() !== null || isForgeFrameWindow();
}

/**
 * Checks if the current window is embedded by ForgeFrame.
 *
 * @remarks
 * This is an alias for {@link isHost} that uses more intuitive terminology.
 * "Embedded" means this window is running inside a ForgeFrame iframe or popup,
 * receiving props from the consumer (the embedding app).
 *
 * @returns True if running inside a ForgeFrame iframe or popup
 *
 * @example
 * ```typescript
 * if (isEmbedded()) {
 *   initHost();
 *   const { amount, onSuccess } = window.hostProps;
 *   // Handle embedded context...
 * }
 * ```
 *
 * @public
 */
export function isEmbedded(): boolean {
	return getActiveHost() !== null || isForgeFrameWindow();
}

/**
 * Gets the hostProps object from the window.
 *
 * @remarks
 * This is a convenience function to access `window.hostProps`, which contains
 * all props passed from the consumer plus built-in control methods.
 *
 * @typeParam P - The props type passed from the consumer
 * @returns The hostProps object or undefined if not in a host context
 *
 * @example
 * ```typescript
 * const props = getHostProps();
 * if (props) {
 *   props.onLogin({ id: 1, name: 'John' });
 * }
 * ```
 *
 * @public
 */
export function getHostProps<P extends Record<string, unknown>>():
	| HostProps<P>
	| undefined {
	return (window as unknown as { hostProps?: HostProps<P> }).hostProps;
}
