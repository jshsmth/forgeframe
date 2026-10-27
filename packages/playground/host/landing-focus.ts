/** Longest wait for this window to accept a programmatic landing focus. */
const LANDING_FOCUS_WAIT_MS = 3000;

/**
 * Focuses a host's landing control once this window accepts programmatic focus.
 *
 * @remarks
 * WebKit ignores `focus()` inside a cross-origin frame until the frame has user
 * activation. It can grant the activation of the click that opened the frame a
 * few frames after `host.focus()` resolves, so the first attempt may be dropped.
 * Attempts repeat each animation frame until the control holds focus, the
 * visitor moves focus elsewhere, or the wait ends. Other engines and popups
 * accept the first attempt.
 */
export function focusLandingControl(
	control: HTMLElement,
	options?: FocusOptions,
): void {
	const deadline = performance.now() + LANDING_FOCUS_WAIT_MS;
	const previous = document.activeElement;
	const attempt = (): void => {
		control.focus(options);
		const active = document.activeElement;
		const focusMoved = active === control || active !== previous;
		if (!focusMoved && performance.now() < deadline)
			requestAnimationFrame(attempt);
	};
	attempt();
}
