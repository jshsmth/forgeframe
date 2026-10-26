/**
 * @packageDocumentation
 * Shared internal host runtime types.
 *
 * @remarks
 * This internal module defines the collaboration contracts used by the host
 * bootstrap, transport, security, and props runtime modules so they can share
 * explicit state without reaching through each other's implementations.
 */

import type { FunctionBridge } from "../../communication/bridge";
import type { MessageHandler } from "../../communication/messenger";
import type { ContextType } from "../../constants";
import type { EventEmitter } from "../../events/emitter";
import type { StandardSchemaV1 } from "../../props/schema";
import type { SerializedProps } from "../../props/types";
import type { HostEvents } from "../../types/events";
import type { PropsDefinition } from "../../types/props";
import type { GetPeerInstancesOptions, PeerInfo } from "../../types/runtime";
import type { Dimensions, OriginMatcher } from "../../types/utility";

export type VerifiedMessageSource = Parameters<MessageHandler>[1];

/**
 * The props a host accepts: its definitions, which also select the fields it
 * keeps, or `"unchecked"` for a tag-agnostic host without `props`, which keeps
 * every field unvalidated. A component without props declares none.
 */
export type HostPropDefinitions<P> = PropsDefinition<P> | "unchecked";

export interface HostRuntimeOptions<P> {
	/** Validates the consumer's props, or keeps them unchecked. */
	props: HostPropDefinitions<P>;
	/** Checks each export before it is sent; without it, exports are sent unchecked. */
	exportsSchema?: StandardSchemaV1;
	/** Checked against the selected consumer origin before BOOTSTRAP is sent. */
	consumerOrigins: OriginMatcher;
	/** The parent or opener window, resolved before the runtime is built. */
	consumerWindow: Window;
	/** Sends INIT as soon as `ready` resolves; otherwise INIT waits for `init()`. */
	autoInit?: boolean;
	/** Runs first in `destroy()`, before resources are released. */
	onDestroy?: () => void;
}

export interface HostPropsRuntimeControls {
	close(): Promise<void>;
	focus(): Promise<void>;
	resize(dimensions: Dimensions): Promise<void>;
	show(): Promise<void>;
	hide(): Promise<void>;
	reportError(error: Error): Promise<void>;
	exportData<T>(exports: T): Promise<void>;
	getPeerInstances(options?: GetPeerInstancesOptions): Promise<PeerInfo[]>;
}

export interface HostPropsRuntimeOptions {
	uid: string;
	tag: string;
	event: EventEmitter<HostEvents>;
	controls: HostPropsRuntimeControls;
	getConsumerWindow(): Window;
	getConsumerOrigin(): string;
	getBridge(): FunctionBridge;
}

export interface HostTransportOptions {
	uid: string;
	/** Popup hosts resize their own window; consumers cannot across origins. */
	context: ContextType;
	event: EventEmitter<HostEvents>;
	consumerWindow: Window;
	consumerOrigin: string;
	getConsumerOrigin(): string;
	/** Settles once the verified bootstrap completes; INIT waits for it. */
	beforeInit: () => Promise<unknown>;
}

export interface HostTransportPropsHandler {
	isConsumerSource(source: VerifiedMessageSource): boolean;
	applySerializedProps(serializedProps: SerializedProps): { success: true };
}
