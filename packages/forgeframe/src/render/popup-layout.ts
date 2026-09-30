/** Browser observations needed to centre a popup. @internal */
export interface PopupScreen {
	screenX: number;
	screenY: number;
	outerWidth: number;
	outerHeight: number;
}

/**
 * Centers a popup within the supplied outer-window bounds, rounding position down.
 * Dimensions and screen observations use CSS pixels; the feature string requests
 * a visible location bar along with resizing and scrolling.
 * @internal
 */
export function buildPopupFeatures(
	width: number,
	height: number,
	screen: PopupScreen,
): string {
	const left = Math.floor(screen.screenX + (screen.outerWidth - width) / 2);
	const top = Math.floor(screen.screenY + (screen.outerHeight - height) / 2);
	return [
		`width=${width}`,
		`height=${height}`,
		`left=${left}`,
		`top=${top}`,
		"menubar=no",
		"toolbar=no",
		"location=yes",
		"status=no",
		"resizable=yes",
		"scrollbars=yes",
	].join(",");
}

/**
 * Calculates the next close-poll delay, capped at `maximum`.
 * `current` and `maximum` are milliseconds; the caller owns scheduling.
 * @internal
 */
export function nextPopupPollInterval(
	current: number,
	multiplier: number,
	maximum: number,
): number {
	return Math.min(current * multiplier, maximum);
}
