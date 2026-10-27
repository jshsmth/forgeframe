import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { focusLandingControl } from "../../../playground/host/landing-focus";

let frames: FrameRequestCallback[];
let now: number;

/** Runs the next queued animation frame after advancing the clock. */
function nextFrame(elapsedMs = 16): void {
	now += elapsedMs;
	frames.shift()?.(now);
}

/** A button whose first `refusals` focus calls are ignored, as WebKit does. */
function refusingButton(refusals: number): HTMLButtonElement {
	const button = document.createElement("button");
	document.body.append(button);
	const focus = button.focus.bind(button);
	vi.spyOn(button, "focus").mockImplementation((options) => {
		if (refusals-- > 0) return;
		focus(options);
	});
	return button;
}

beforeEach(() => {
	frames = [];
	now = 0;
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
		frames.push(callback),
	);
	vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

describe("host landing focus", () => {
	it("focuses at once when the window accepts focus", () => {
		const button = refusingButton(0);
		focusLandingControl(button, { preventScroll: true });
		expect(document.activeElement).toBe(button);
		expect(button.focus).toHaveBeenCalledWith({ preventScroll: true });
		expect(frames).toHaveLength(0);
	});

	it("retries each frame until a refused focus is accepted", () => {
		const button = refusingButton(2);
		focusLandingControl(button);
		expect(document.activeElement).toBe(document.body);
		nextFrame();
		expect(document.activeElement).toBe(document.body);
		nextFrame();
		expect(document.activeElement).toBe(button);
		expect(button.focus).toHaveBeenCalledTimes(3);
		expect(frames).toHaveLength(0);
	});

	it("stops without taking focus from a control the visitor focused", () => {
		const button = refusingButton(Number.POSITIVE_INFINITY);
		const visitorChoice = document.createElement("input");
		document.body.append(visitorChoice);
		focusLandingControl(button);
		visitorChoice.focus();
		nextFrame();
		expect(document.activeElement).toBe(visitorChoice);
		expect(button.focus).toHaveBeenCalledTimes(2);
		expect(frames).toHaveLength(0);
	});

	it("keeps retrying while focus stays where it was before the first attempt", () => {
		const earlier = document.createElement("input");
		document.body.append(earlier);
		earlier.focus();
		const button = refusingButton(1);
		focusLandingControl(button);
		expect(document.activeElement).toBe(earlier);
		nextFrame();
		expect(document.activeElement).toBe(button);
		expect(frames).toHaveLength(0);
	});

	it("gives up after the wait when focus is never accepted", () => {
		const button = refusingButton(Number.POSITIVE_INFINITY);
		focusLandingControl(button);
		nextFrame(2999);
		expect(frames).toHaveLength(1);
		nextFrame(1);
		expect(frames).toHaveLength(0);
		expect(document.activeElement).toBe(document.body);
		expect(button.focus).toHaveBeenCalledTimes(3);
	});
});
