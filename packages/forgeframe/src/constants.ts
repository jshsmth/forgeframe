/**
 * Rendering context types for components.
 *
 * @remarks
 * Components can be rendered as either iframes or popups.
 * The context determines how the host window is created and managed.
 *
 * @public
 */
export const CONTEXT = {
	/** Render component in an iframe */
	IFRAME: "iframe",
	/** Render component in a popup window */
	POPUP: "popup",
} as const;

/**
 * Union type of valid rendering contexts.
 * @public
 */
export type ContextType = (typeof CONTEXT)[keyof typeof CONTEXT];

/**
 * Component lifecycle event names.
 *
 * @remarks
 * These events are emitted during the component lifecycle and can be
 * listened to via `instance.event.on(EVENT.RENDERED, handler)`.
 *
 * @example
 * ```typescript
 * const instance = MyComponent({ prop: 'value' });
 * instance.event.on(EVENT.RENDERED, () => {
 *   console.log('Component is ready!');
 * });
 * instance.render('#container');
 * ```
 *
 * @public
 */
export const EVENT = {
	/** Emitted when rendering starts */
	RENDER: "render",
	/** Emitted when component is fully rendered and initialized */
	RENDERED: "rendered",
	/** Emitted when prerender (loading) phase starts */
	PRERENDER: "prerender",
	/** Emitted when prerender phase completes */
	PRERENDERED: "prerendered",
	/** Emitted when component becomes visible */
	DISPLAY: "display",
	/** Emitted when an error occurs */
	ERROR: "error",
	/** Emitted when component is closing */
	CLOSE: "close",
	/** Emitted when component is destroyed */
	DESTROY: "destroy",
	/** Emitted when props are updated */
	PROPS: "props",
	/** Emitted when component is resized */
	RESIZE: "resize",
	/** Emitted when component receives focus */
	FOCUS: "focus",
} as const;

/**
 * Union type of valid event names.
 * @public
 */
export type EventType = (typeof EVENT)[keyof typeof EVENT];

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
	/** Consumer export from host context */
	CONSUMER_EXPORT: "forgeframe_consumer_export",
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
