/**
 * @packageDocumentation
 *
 * Internal source barrel for ForgeFrame rendering primitives.
 *
 * @remarks
 * This file groups iframe, popup, and template helpers for internal source
 * organization. The published package does not expose a `forgeframe/render`
 * subpath, so consumers should treat this barrel as internal implementation
 * structure.
 */

export {
	createIframe,
	createPrerenderIframe,
	destroyIframe,
	focusIframe,
	hideIframe,
	type IframeOptions,
	resizeIframe,
	showIframe,
} from "./iframe";

export {
	closePopup,
	focusPopup,
	isPopupBlocked,
	openPopup,
	PopupOpenError,
	type PopupOptions,
	resizePopup,
	watchPopupClose,
} from "./popup";

export {
	applyDimensions,
	createStyleElement,
	defaultContainerTemplate,
	defaultPrerenderTemplate,
	fadeIn,
	fadeOut,
	swapPrerenderContent,
} from "./templates";
