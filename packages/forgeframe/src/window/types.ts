/**
 * Internal window/bootstrap wire contracts.
 */

import type { ContextType } from "../constants";
import type { SerializedProps } from "../props/types";

/**
 * Channel metadata encoded in window.name. Props arrive only through the
 * verified bootstrap, so the payload never carries them.
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

/** Props delivered only over verified messaging. @internal */
export interface HostBootstrapData {
	props: SerializedProps;
}
