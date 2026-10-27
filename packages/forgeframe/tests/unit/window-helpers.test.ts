/**
 * Unit tests for cross-window helpers in `@/window/helpers`.
 *
 * Covers domain matching, opener/consumer lookup, and iframe/popup detection.
 */
import { describe, expect, it } from "vitest";
import {
	getConsumer,
	getOpener,
	getOrigin,
	isIframe,
	isPopup,
	isWindowClosed,
	matchOrigin,
} from "@/window/helpers";
import { createFrameWindow } from "../frame-window";

/** The test window, except that reading `key` calls `read`. */
function windowWith<K extends keyof Window>(
	key: K,
	read: () => Window[K],
): Window {
	return new Proxy(window, {
		get: (target, property) =>
			property === key ? read() : Reflect.get(target, property),
	});
}

/** A window whose `key` throws on read, as it does across origins. */
function crossOriginWindow(key: keyof Window): Window {
	return windowWith(key, () => {
		throw new Error("Cross-origin access denied");
	});
}

describe("getOrigin", () => {
	it("should return current window origin", () => {
		const domain = getOrigin();
		expect(domain).toBe(window.location.origin);
	});

	it("should return empty string for cross-origin window", () => {
		const crossOriginWin = crossOriginWindow("location");

		expect(getOrigin(crossOriginWin)).toBe("");
	});
});

describe("matchOrigin", () => {
	it('should match wildcard "*"', () => {
		expect(matchOrigin("*", "https://example.com")).toBe(true);
		expect(matchOrigin("*", "https://any.domain.com")).toBe(true);
	});

	it("should match exact string", () => {
		expect(matchOrigin("https://example.com", "https://example.com")).toBe(
			true,
		);
		expect(matchOrigin("https://example.com", "https://other.com")).toBe(false);
	});

	it("should match wildcard string patterns", () => {
		expect(
			matchOrigin("https://*.example.com", "https://sub.example.com"),
		).toBe(true);
		// Only leading labels may be wildcards.
		expect(
			matchOrigin("https://api.*.example.com", "https://api.us.example.com"),
		).toBe(false);
		expect(matchOrigin("https://*example.com", "https://evilexample.com")).toBe(
			false,
		);
		expect(matchOrigin("https://*.example.com", "https://example.com")).toBe(
			false,
		);
		expect(matchOrigin("https://*.example.com", "https://evil.com")).toBe(
			false,
		);
	});

	it("should match RegExp", () => {
		expect(matchOrigin(/example\.com$/, "https://example.com")).toBe(true);
		expect(matchOrigin(/example\.com$/, "https://sub.example.com")).toBe(true);
		expect(matchOrigin(/example\.com$/, "https://other.com")).toBe(false);
	});

	it("should handle global RegExp patterns consistently", () => {
		const pattern = /example\.com$/g;

		expect(matchOrigin(pattern, "https://example.com")).toBe(true);
		expect(matchOrigin(pattern, "https://example.com")).toBe(true);
	});

	it("should match array of patterns (OR logic)", () => {
		const patterns = ["https://a.com", "https://b.com"];

		expect(matchOrigin(patterns, "https://a.com")).toBe(true);
		expect(matchOrigin(patterns, "https://b.com")).toBe(true);
		expect(matchOrigin(patterns, "https://c.com")).toBe(false);
	});

	it("should handle mixed array patterns", () => {
		const patterns = ["https://exact.com", /\.trusted\.com$/];

		expect(matchOrigin(patterns, "https://exact.com")).toBe(true);
		expect(matchOrigin(patterns, "https://sub.trusted.com")).toBe(true);
		expect(matchOrigin(patterns, "https://untrusted.com")).toBe(false);
	});

	it("should return false for invalid pattern type", () => {
		// @ts-expect-error a non-pattern value reaching the matcher must deny, not match.
		expect(matchOrigin(123, "https://example.com")).toBe(false);
	});
});

describe("isWindowClosed", () => {
	it("should return true for null window", () => {
		expect(isWindowClosed(null)).toBe(true);
	});

	it("should return false for open window", () => {
		const openWin = { closed: false } as Window;
		expect(isWindowClosed(openWin)).toBe(false);
	});

	it("should return true for closed window", () => {
		const closedWin = { closed: true } as Window;
		expect(isWindowClosed(closedWin)).toBe(true);
	});

	it("should return true when accessing closed throws", () => {
		const errorWin = crossOriginWindow("closed");

		expect(isWindowClosed(errorWin)).toBe(true);
	});
});

describe("getOpener", () => {
	it("should return null for window without opener", () => {
		const win = { opener: null } as Window;
		expect(getOpener(win)).toBeNull();
	});

	it("should return opener when available", () => {
		const openerWin = {} as Window;
		const win = { opener: openerWin } as Window;
		expect(getOpener(win)).toBe(openerWin);
	});

	it("should return null on cross-origin error", () => {
		const win = crossOriginWindow("opener");

		expect(getOpener(win)).toBeNull();
	});
});

describe("getConsumer", () => {
	it("should return null for top-level window", () => {
		const win = createFrameWindow();
		// A detached window's parent is null, which lib.dom's type omits.
		Object.defineProperty(win, "parent", { value: null });
		expect(getConsumer(win)).toBeNull();
	});

	it("should return null when parent is self", () => {
		const win = {} as Window;
		(win as { parent: Window }).parent = win;
		expect(getConsumer(win)).toBeNull();
	});

	it("should return consumer when in iframe", () => {
		const consumerWin = {} as Window;
		const win = { parent: consumerWin } as Window;
		expect(getConsumer(win)).toBe(consumerWin);
	});

	it("should return null on cross-origin error", () => {
		const win = crossOriginWindow("parent");

		expect(getConsumer(win)).toBeNull();
	});
});

describe("isIframe", () => {
	it("should return false for top-level window", () => {
		const win = {} as Window;
		(win as { parent: Window }).parent = win;
		expect(isIframe(win)).toBe(false);
	});

	it("should return true when in iframe", () => {
		const parentWin = {} as Window;
		const win = { parent: parentWin } as Window;
		expect(isIframe(win)).toBe(true);
	});

	it("should return true on cross-origin error (conservative)", () => {
		const win = crossOriginWindow("parent");

		expect(isIframe(win)).toBe(true);
	});
});

describe("isPopup", () => {
	it("should return false for window without opener", () => {
		const win = { opener: null } as Window;
		expect(isPopup(win)).toBe(false);
	});

	it("should return true for popup with opener", () => {
		const openerWin = {} as Window;
		const win = { opener: openerWin } as Window;
		expect(isPopup(win)).toBe(true);
	});

	it("should return false on cross-origin error", () => {
		const win = crossOriginWindow("opener");

		expect(isPopup(win)).toBe(false);
	});
});
