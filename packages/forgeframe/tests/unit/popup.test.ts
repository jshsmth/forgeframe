/**
 * Unit tests for `@/render/popup`.
 *
 * Covers popup open/focus/close/resize utilities, popup-block detection through `openPopup`, and close watcher polling behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	closePopup,
	focusPopup,
	openPopup,
	resizePopup,
	watchPopupClose,
} from "@/render/popup";
import { forgeFrameError } from "../forgeframe-error";

describe("openPopup", () => {
	// vi.spyOn(window, "open") is restored by restoreMocks.
	it("should open popup with correct features", () => {
		const mockWin = {
			closed: false,
			innerWidth: 500,
			innerHeight: 600,
		} as Window;

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
		const mockWin = {
			closed: false,
			innerWidth: 500,
			innerHeight: 600,
		} as Window;

		vi.spyOn(window, "open").mockReturnValue(mockWin);

		openPopup({
			url: "https://example.com",
			name: "test-popup",
			dimensions: { width: 500, height: 600 },
		});

		const call = vi.mocked(window.open).mock.calls[0];
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
		["closed", { closed: true }],
		["zero-dimension", { closed: false, innerWidth: 0, innerHeight: 0 }],
		[
			"inaccessible",
			{
				get closed(): boolean {
					throw new Error("Access denied");
				},
			},
		],
	])("should throw POPUP_BLOCKED for a %s popup window", (label, mockWin) => {
		vi.spyOn(window, "open").mockReturnValue(mockWin as unknown as Window);
		const close = vi.fn();
		Object.defineProperty(mockWin, "close", { value: close });

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
		const mockWin = {
			closed: false,
			innerWidth: 500,
			innerHeight: 600,
		} as Window;

		vi.spyOn(window, "open").mockReturnValue(mockWin);

		openPopup({
			url: "https://example.com",
			name: "test-popup",
			dimensions: { width: "500px", height: "600px" },
		});

		const call = vi.mocked(window.open).mock.calls[0];
		const features = call[2] as string;

		expect(features).toContain("width=500");
		expect(features).toContain("height=600");
	});

	it("should use fallback for invalid dimensions", () => {
		const mockWin = {
			closed: false,
			innerWidth: 500,
			innerHeight: 500,
		} as Window;

		vi.spyOn(window, "open").mockReturnValue(mockWin);

		openPopup({
			url: "https://example.com",
			name: "test-popup",
			dimensions: { width: "invalid", height: "invalid" },
		});

		const call = vi.mocked(window.open).mock.calls[0];
		const features = call[2] as string;

		// Should use fallback of 500
		expect(features).toContain("width=500");
		expect(features).toContain("height=500");
	});
});

describe("closePopup", () => {
	it("should close open popup", () => {
		const mockWin = {
			closed: false,
			close: vi.fn(),
		} as unknown as Window;

		closePopup(mockWin);

		expect(mockWin.close).toHaveBeenCalled();
	});

	it("should not call close on already closed popup", () => {
		const mockWin = {
			closed: true,
			close: vi.fn(),
		} as unknown as Window;

		closePopup(mockWin);

		expect(mockWin.close).not.toHaveBeenCalled();
	});

	it("should not throw when popup.close() throws due to access errors", () => {
		const mockWin = {
			closed: false,
			close: vi.fn().mockImplementation(() => {
				throw new Error("Access denied");
			}),
		} as unknown as Window;

		expect(() => closePopup(mockWin)).not.toThrow();
	});
});

describe("focusPopup", () => {
	it("should focus open popup", () => {
		const mockWin = {
			closed: false,
			focus: vi.fn(),
		} as unknown as Window;

		focusPopup(mockWin);

		expect(mockWin.focus).toHaveBeenCalled();
	});

	it("should not focus closed popup", () => {
		const mockWin = {
			closed: true,
			focus: vi.fn(),
		} as unknown as Window;

		focusPopup(mockWin);

		expect(mockWin.focus).not.toHaveBeenCalled();
	});

	it("should not throw when popup.focus() throws due to access errors", () => {
		const mockWin = {
			closed: false,
			focus: vi.fn().mockImplementation(() => {
				throw new Error("Access denied");
			}),
		} as unknown as Window;

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
		const mockWin = {
			get closed() {
				return isClosed;
			},
		} as Window;

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
		const mockWin = { closed: false } as Window;

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
		const mockWin = {
			get closed() {
				throw new Error("Cross-origin");
			},
		} as unknown as Window;

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
			{ closed: true } as Window,
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
		const mockWin = {
			get closed() {
				return isClosed;
			},
		} as Window;

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
		const mockWin = {
			outerWidth: 400,
			outerHeight: 300,
			resizeTo: vi.fn(),
		} as unknown as Window;

		resizePopup(mockWin, { width: 600, height: 500 });

		expect(mockWin.resizeTo).toHaveBeenCalledWith(600, 500);
	});

	it("should use current dimensions as fallback", () => {
		const mockWin = {
			outerWidth: 400,
			outerHeight: 300,
			resizeTo: vi.fn(),
		} as unknown as Window;

		resizePopup(mockWin, {});

		expect(mockWin.resizeTo).toHaveBeenCalledWith(400, 300);
	});

	it("keeps current dimensions when resize uses nonpixel CSS units", () => {
		const mockWin = {
			outerWidth: 400,
			outerHeight: 300,
			resizeTo: vi.fn(),
		} as unknown as Window;
		resizePopup(mockWin, { width: "100%", height: "50vh" });
		expect(mockWin.resizeTo).toHaveBeenCalledWith(400, 300);
	});

	it("should handle string dimensions", () => {
		const mockWin = {
			outerWidth: 400,
			outerHeight: 300,
			resizeTo: vi.fn(),
		} as unknown as Window;

		resizePopup(mockWin, { width: "800px", height: "600px" });

		expect(mockWin.resizeTo).toHaveBeenCalledWith(800, 600);
	});

	it("reports a denied resize without throwing", () => {
		const mockWin = {
			outerWidth: 400,
			outerHeight: 300,
			resizeTo: vi.fn().mockImplementation(() => {
				throw new Error("Resize blocked");
			}),
		} as unknown as Window;

		expect(resizePopup(mockWin, { width: 600, height: 500 })).toBe(false);
	});

	it("reports cross-origin windows whose outer size cannot be read", () => {
		const resizeTo = vi.fn();
		const crossOrigin = {
			get outerWidth(): number {
				throw new DOMException("Blocked", "SecurityError");
			},
			resizeTo,
		} as unknown as Window;

		expect(resizePopup(crossOrigin, { height: 500 })).toBe(false);
		expect(resizeTo).not.toHaveBeenCalled();
	});

	it("reports an allowed resize", () => {
		const mockWin = {
			outerWidth: 400,
			outerHeight: 300,
			resizeTo: vi.fn(),
		} as unknown as Window;

		expect(resizePopup(mockWin, { width: 600 })).toBe(true);
	});
});
