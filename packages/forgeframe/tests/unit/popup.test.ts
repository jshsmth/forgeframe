/**
 * Unit tests for `@/render/popup`.
 *
 * Covers popup open/focus/close/resize utilities, popup-block detection through `openPopup`, and close watcher polling behavior.
 */
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type Mock,
	vi,
} from "vitest";
import {
	closePopup,
	focusPopup,
	openPopup,
	resizePopup,
	watchPopupClose,
} from "@/render/popup";
import { forgeFrameError } from "../forgeframe-error";
import { createFrameWindow } from "../frame-window";
import { requireValue } from "../require-value";

/** A real window whose `closed` reads `closed()`, open by default. */
function popupWindow(closed: () => boolean = () => false): Window {
	const win = createFrameWindow();
	Object.defineProperty(win, "closed", { get: closed });
	return win;
}

/** An open popup with a 400x300 outer size and a recorded `resizeTo`. */
function resizablePopup(): {
	win: Window;
	resizeTo: Mock<Window["resizeTo"]>;
} {
	const win = popupWindow();
	vi.spyOn(win, "outerWidth", "get").mockReturnValue(400);
	vi.spyOn(win, "outerHeight", "get").mockReturnValue(300);
	const resizeTo = vi.fn<Window["resizeTo"]>();
	win.resizeTo = resizeTo;
	return { win, resizeTo };
}

function throwAccessDenied(): never {
	throw new Error("Access denied");
}

describe("openPopup", () => {
	// vi.spyOn(window, "open") is restored by restoreMocks.
	it("should open popup with correct features", () => {
		const mockWin = popupWindow();

		vi.spyOn(window, "open").mockReturnValue(mockWin);

		const popup = openPopup({
			url: "https://example.com",
			name: "test-popup",
			dimensions: { width: 500, height: 600 },
		});

		expect(popup).toBe(mockWin);
		expect(window.open).toHaveBeenCalledWith(
			"https://example.com",
			"test-popup",
			expect.stringContaining("width=500"),
		);
		expect(window.open).toHaveBeenCalledWith(
			"https://example.com",
			"test-popup",
			expect.stringContaining("height=600"),
		);
	});

	it("should include security features", () => {
		vi.spyOn(window, "open").mockReturnValue(popupWindow());

		openPopup({
			url: "https://example.com",
			name: "test-popup",
			dimensions: { width: 500, height: 600 },
		});

		const call = requireValue(vi.mocked(window.open).mock.calls[0]);
		const features = call[2] as string;

		expect(features).toContain("location=yes");
		expect(features).toContain("resizable=yes");
		expect(features).toContain("scrollbars=yes");
	});

	it("should throw POPUP_BLOCKED when popup is blocked", () => {
		vi.spyOn(window, "open").mockReturnValue(null);

		expect(() =>
			openPopup({
				url: "https://example.com",
				name: "test-popup",
				dimensions: { width: 500, height: 600 },
			}),
		).toThrow(forgeFrameError("POPUP_BLOCKED"));
	});

	it.each([
		["closed", () => popupWindow(() => true)],
		[
			"zero-dimension",
			() => {
				const win = popupWindow();
				vi.spyOn(win, "innerWidth", "get").mockReturnValue(0);
				vi.spyOn(win, "innerHeight", "get").mockReturnValue(0);
				return win;
			},
		],
		["inaccessible", () => popupWindow(throwAccessDenied)],
	])("should throw POPUP_BLOCKED for a %s popup window", (label, createWin) => {
		const mockWin = createWin();
		vi.spyOn(window, "open").mockReturnValue(mockWin);
		const close = vi.fn<Window["close"]>();
		mockWin.close = close;

		expect(() =>
			openPopup({
				url: "https://example.com",
				name: "test-popup",
				dimensions: { width: 500, height: 600 },
			}),
		).toThrow(forgeFrameError("POPUP_BLOCKED"));
		// A window that only looked blocked is closed, not left untracked.
		if (label === "zero-dimension") expect(close).toHaveBeenCalledOnce();
	});

	it("should handle string dimensions", () => {
		vi.spyOn(window, "open").mockReturnValue(popupWindow());

		openPopup({
			url: "https://example.com",
			name: "test-popup",
			dimensions: { width: "500px", height: "600px" },
		});

		const call = requireValue(vi.mocked(window.open).mock.calls[0]);
		const features = call[2] as string;

		expect(features).toContain("width=500");
		expect(features).toContain("height=600");
	});

	it("should use fallback for invalid dimensions", () => {
		vi.spyOn(window, "open").mockReturnValue(popupWindow());

		openPopup({
			url: "https://example.com",
			name: "test-popup",
			dimensions: { width: "invalid", height: "invalid" },
		});

		const call = requireValue(vi.mocked(window.open).mock.calls[0]);
		const features = call[2] as string;

		// Should use fallback of 500
		expect(features).toContain("width=500");
		expect(features).toContain("height=500");
	});
});

describe("closePopup", () => {
	it("should close open popup", () => {
		const mockWin = popupWindow();
		const close = vi.fn<Window["close"]>();
		mockWin.close = close;

		closePopup(mockWin);

		expect(close).toHaveBeenCalled();
	});

	it("should not call close on already closed popup", () => {
		const mockWin = popupWindow(() => true);
		const close = vi.fn<Window["close"]>();
		mockWin.close = close;

		closePopup(mockWin);

		expect(close).not.toHaveBeenCalled();
	});

	it("should not throw when popup.close() throws due to access errors", () => {
		const mockWin = popupWindow();
		mockWin.close = throwAccessDenied;

		expect(() => closePopup(mockWin)).not.toThrow();
	});
});

describe("focusPopup", () => {
	it("should focus open popup", () => {
		const mockWin = popupWindow();
		const focus = vi.fn<Window["focus"]>();
		mockWin.focus = focus;

		focusPopup(mockWin);

		expect(focus).toHaveBeenCalled();
	});

	it("should not focus closed popup", () => {
		const mockWin = popupWindow(() => true);
		const focus = vi.fn<Window["focus"]>();
		mockWin.focus = focus;

		focusPopup(mockWin);

		expect(focus).not.toHaveBeenCalled();
	});

	it("should not throw when popup.focus() throws due to access errors", () => {
		const mockWin = popupWindow();
		mockWin.focus = throwAccessDenied;

		expect(() => focusPopup(mockWin)).not.toThrow();
	});
});

describe("watchPopupClose", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should call callback when popup closes", () => {
		const callback = vi.fn();
		let isClosed = false;
		const mockWin = popupWindow(() => isClosed);

		watchPopupClose(mockWin, callback, {
			initialInterval: 100,
			maxInterval: 100,
			multiplier: 1,
		});

		// Not closed yet
		vi.advanceTimersByTime(100);
		expect(callback).not.toHaveBeenCalled();

		// Close popup
		isClosed = true;
		vi.advanceTimersByTime(100);

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it("should return cleanup function", () => {
		const callback = vi.fn();
		const mockWin = popupWindow();

		const cleanup = watchPopupClose(mockWin, callback, {
			initialInterval: 100,
			maxInterval: 100,
			multiplier: 1,
		});
		cleanup();

		// Simulate popup closing after cleanup
		vi.advanceTimersByTime(500);

		expect(callback).not.toHaveBeenCalled();
	});

	it("should call callback on access error (window inaccessible)", () => {
		const callback = vi.fn();
		const mockWin = popupWindow(() => {
			throw new Error("Cross-origin");
		});

		watchPopupClose(mockWin, callback, {
			initialInterval: 100,
			maxInterval: 100,
			multiplier: 1,
		});

		vi.advanceTimersByTime(100);

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it("logs a close callback that throws", () => {
		const failure = new Error("callback failed");
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		watchPopupClose(
			popupWindow(() => true),
			() => {
				throw failure;
			},
			{ initialInterval: 100, maxInterval: 100, multiplier: 1 },
		);
		vi.advanceTimersByTime(100);

		expect(consoleSpy).toHaveBeenCalledExactlyOnceWith(
			"Error in popup close callback:",
			failure,
		);
	});

	it("should use default interval of 100ms (with exponential backoff)", () => {
		const callback = vi.fn();
		let isClosed = false;
		const mockWin = popupWindow(() => isClosed);

		watchPopupClose(mockWin, callback);

		// Default is 100ms initial interval
		vi.advanceTimersByTime(50);
		expect(callback).not.toHaveBeenCalled();

		isClosed = true;
		vi.advanceTimersByTime(100);

		expect(callback).toHaveBeenCalled();
	});
});

describe("resizePopup", () => {
	it("should resize popup to new dimensions", () => {
		const { win, resizeTo } = resizablePopup();

		resizePopup(win, { width: 600, height: 500 });

		expect(resizeTo).toHaveBeenCalledWith(600, 500);
	});

	it("should use current dimensions as fallback", () => {
		const { win, resizeTo } = resizablePopup();

		resizePopup(win, {});

		expect(resizeTo).toHaveBeenCalledWith(400, 300);
	});

	it("keeps current dimensions when resize uses nonpixel CSS units", () => {
		const { win, resizeTo } = resizablePopup();
		resizePopup(win, { width: "100%", height: "50vh" });
		expect(resizeTo).toHaveBeenCalledWith(400, 300);
	});

	it("should handle string dimensions", () => {
		const { win, resizeTo } = resizablePopup();

		resizePopup(win, { width: "800px", height: "600px" });

		expect(resizeTo).toHaveBeenCalledWith(800, 600);
	});

	it("reports a denied resize without throwing", () => {
		const { win } = resizablePopup();
		win.resizeTo = () => {
			throw new Error("Resize blocked");
		};

		expect(resizePopup(win, { width: 600, height: 500 })).toBe(false);
	});

	it("reports cross-origin windows whose outer size cannot be read", () => {
		const { win: crossOrigin, resizeTo } = resizablePopup();
		vi.spyOn(crossOrigin, "outerWidth", "get").mockImplementation(() => {
			throw new DOMException("Blocked", "SecurityError");
		});

		expect(resizePopup(crossOrigin, { height: 500 })).toBe(false);
		expect(resizeTo).not.toHaveBeenCalled();
	});

	it("reports an allowed resize", () => {
		const { win } = resizablePopup();

		expect(resizePopup(win, { width: 600 })).toBe(true);
	});
});
