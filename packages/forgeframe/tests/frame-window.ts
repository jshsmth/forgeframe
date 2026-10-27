import { onTestFinished } from "vitest";
import { requireValue } from "./require-value";

/**
 * A real jsdom window in a new iframe, removed when the test finishes.
 *
 * Tests change its members with `vi.spyOn()` or `Object.defineProperty()`
 * instead of casting a partial object to `Window`. jsdom windows have no
 * `closed` property, so it is set as a browser reports it: false while the
 * window is open, or true for a test that needs a closed window.
 */
export function createFrameWindow({ closed = false } = {}): Window {
	const frame = document.createElement("iframe");
	document.body.append(frame);
	const win = requireValue(frame.contentWindow);
	Object.defineProperty(win, "closed", { value: closed, configurable: true });
	const { close } = win;
	onTestFinished(() => {
		// Removing the frame calls its window's close(), which a test may replace.
		win.close = close;
		frame.remove();
	});
	return win;
}
