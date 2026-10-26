import type { EventType } from "./types/events";

/**
 * A rendering context: an iframe or a popup window.
 *
 * @remarks
 * The context determines how the host window is created and managed.
 *
 * @public
 */
export type ContextType = "iframe" | "popup";

/**
 * Rendering context names used internally.
 * @internal
 */
export const CONTEXT = {
	/** Render component in an iframe */
	IFRAME: "iframe",
	/** Render component in a popup window */
	POPUP: "popup",
} as const satisfies Record<string, ContextType>;

/**
 * Consumer lifecycle event names used internally; `EventType` is the public
 * union.
 * @internal
 */
export const EVENT = {
	/** Emitted when rendering starts, before any frame or placeholder exists */
	RENDER: "render",
	/** Emitted when the host initialized and the component is visible */
	RENDERED: "rendered",
	/** Emitted when an error occurs */
	ERROR: "error",
	/** Emitted when closing starts */
	CLOSE: "close",
	/** Emitted after teardown finished; always the last event */
	CLOSED: "closed",
	/** Emitted when a props update is committed */
	PROPS: "props",
	/** Emitted when a resize is applied */
	RESIZE: "resize",
	/** Emitted when a focus request is applied */
	FOCUS: "focus",
	/** Emitted when host exports arrive */
	EXPORTS: "exports",
} as const satisfies Record<string, EventType>;

/**
 * Internal message types for the cross-domain communication protocol.
 * @internal
 */
export const MESSAGE_TYPE = {
	/** Request message expecting a response */
	REQUEST: "request",
	/** Response to a previous request */
	RESPONSE: "response",
} as const;

/**
 * Message names for the consumer-host communication protocol.
 *
 * @remarks
 * These are the internal message identifiers used by the postMessage protocol.
 * Each message type corresponds to a specific action in the component lifecycle.
 *
 * @internal
 */
export const MESSAGE_NAME = {
	/** Request current props after verifying the loaded host's source and origin. */
	BOOTSTRAP: "forgeframe_bootstrap",
	/** Host initialization complete */
	INIT: "forgeframe_init",
	/** Props update from consumer to host */
	PROPS: "forgeframe_props",
	/** Close request from host */
	CLOSE: "forgeframe_close",
	/** Resize request from host */
	RESIZE: "forgeframe_resize",
	/** Focus request from host */
	FOCUS: "forgeframe_focus",
	/** Show request from host */
	SHOW: "forgeframe_show",
	/** Hide request from host */
	HIDE: "forgeframe_hide",
	/** Error report from host */
	ERROR: "forgeframe_error",
	/** Data export from host to consumer */
	EXPORT: "forgeframe_export",
	/** Cross-domain function call */
	CALL: "forgeframe_call",
	/** Relayed peer export method call */
	PEER_CALL: "forgeframe_peer_call",
	/** Get sibling components request */
	GET_SIBLINGS: "forgeframe_get_siblings",
	/** One-way notice that the host runtime was destroyed */
	TEARDOWN: "forgeframe_teardown",
} as const;

/**
 * Stable wire protocol version for consumer-host bootstrap payloads.
 *
 * @remarks
 * A missing protocol or protocol 1 identifies ForgeFrame 0.x, protocol 2
 * identifies 1.x, and protocol 3 identifies 2.x. Hosts accept only this version.
 *
 * @internal
 */
export const PROTOCOL_VERSION = 3;

/**
 * Window name prefix for identifying ForgeFrame host windows.
 *
 * @remarks
 * This prefix is prepended to the base64-encoded payload in `window.name`
 * to identify windows created by ForgeFrame.
 *
 * @internal
 */
export const WINDOW_NAME_PREFIX = "__forgeframe__";

/**
 * Current library version.
 * @public
 */
declare const __FORGEFRAME_VERSION__: string | undefined;

export const VERSION = (() => {
	if (
		typeof __FORGEFRAME_VERSION__ !== "string" ||
		__FORGEFRAME_VERSION__.trim().length === 0
	) {
		throw new Error(
			"ForgeFrame VERSION injection is missing. Configure __FORGEFRAME_VERSION__ in build/test tooling.",
		);
	}

	return __FORGEFRAME_VERSION__;
})();
