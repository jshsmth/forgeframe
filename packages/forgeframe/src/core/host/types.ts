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
import type { SerializedProps } from "../../props/types";
import type { GetPeerInstancesOptions, SiblingInfo } from "../../types/runtime";
import type { Dimensions } from "../../types/utility";

export type VerifiedMessageSource = Parameters<MessageHandler>[1];

export interface HostPropsRuntimeControls {
	close(): Promise<void>;
	focus(): Promise<void>;
	resize(dimensions: Dimensions): Promise<void>;
	show(): Promise<void>;
	hide(): Promise<void>;
	onError(error: Error): Promise<void>;
	exportData<T>(exports: T): Promise<void>;
	consumerExport<T>(data: T): Promise<void>;
	getPeerInstances(options?: GetPeerInstancesOptions): Promise<SiblingInfo[]>;
}

export interface HostPropsRuntimeOptions {
	uid: string;
	tag: string;
	event: EventEmitter;
	controls: HostPropsRuntimeControls;
	getConsumerWindow(): Window;
	getConsumerDomain(): string;
	getBridge(): FunctionBridge;
}

export interface HostTransportOptions {
	uid: string;
	/** Popup hosts resize their own window; consumers cannot across origins. */
	context: ContextType;
	event: EventEmitter;
	consumerWindow: Window;
	consumerDomain: string;
	getConsumerDomain(): string;
	/** Settles once the verified bootstrap completes; INIT waits for it. */
	beforeInit: () => Promise<unknown>;
}

export interface HostTransportPropsHandler {
	isConsumerSource(source: VerifiedMessageSource): boolean;
	applySerializedProps(serializedProps: SerializedProps): { success: true };
}
