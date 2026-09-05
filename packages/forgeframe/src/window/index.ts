/**
 * @packageDocumentation
 * Internal source barrel for ForgeFrame window utilities.
 *
 * @remarks
 * This file groups cross-window helpers and payload parsing for internal
 * source organization. The published package does not
 * expose a `forgeframe/window` subpath, so consumers should treat this barrel
 * as internal implementation structure.
 */

export {
	closeWindow,
	focusWindow,
	getAncestor,
	getConsumer,
	getDistanceToConsumer,
	getDomain,
	getFrames,
	getOpener,
	getTop,
	isIframe,
	isPopup,
	isSameDomain,
	isWindowClosed,
	matchDomain,
} from "./helpers";

export {
	buildWindowName,
	consumeInitialPayload,
	createWindowPayload,
	getInitialPayload,
	isForgeFrameWindow,
	isHostOfComponent,
	parseWindowName,
	updateWindowName,
} from "./name-payload";
