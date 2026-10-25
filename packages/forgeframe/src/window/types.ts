/**
 * Internal window/bootstrap wire contracts.
 */

import type { ContextType } from "../constants";
import type { SerializedProps } from "../props/types";
import type { PropsDefinition } from "../types/props";
import type { Dimensions } from "../types/utility";

/**
 * Serializable reference to a host component for cross-domain transfer.
 *
 * @internal
 */
export interface HostComponentRef {
	/** Component tag name */
	tag: string;
	/** Component URL */
	url: string;
	/** Prop definitions */
	props?: PropsDefinition<Record<string, unknown>>;
	/** Default dimensions */
	dimensions?: Dimensions;
	/** Default rendering context */
	defaultContext?: ContextType;
}

/**
 * Channel metadata encoded in window.name. Props and children arrive only
 * through the verified bootstrap, so the payload never carries them.
 *
 * @internal
 */
export interface WindowNamePayload {
	/** Consumer component instance UID */
	uid: string;
	/** Component tag name */
	tag: string;
	/** Stable ForgeFrame wire protocol version */
	protocolVersion: number;
	/** Rendering context */
	context: ContextType;
	/** Consumer window domain */
	consumerDomain: string;
}

/** Props and child references delivered only over verified messaging. @internal */
export interface HostBootstrapData {
	props: SerializedProps;
	children?: Record<string, HostComponentRef>;
}
