/**
 * Unit tests for window name payload helpers in `@/window/name-payload`.
 *
 * Covers envelope encoding, protocol classification of decoded payloads,
 * ForgeFrame window detection, and size/error guardrails.
 */
import { describe, expect, it, vi } from "vitest";
import { CONTEXT, PROTOCOL_VERSION, WINDOW_NAME_PREFIX } from "@/constants";
import {
	buildWindowName,
	classifyWindowNamePayload,
	createWindowPayload,
	isForgeFrameWindow,
	readWindowNamePayload,
} from "@/window/name-payload";
import type { WindowNamePayload } from "@/window/types";

function createPayload(
	overrides: Partial<WindowNamePayload> = {},
): WindowNamePayload {
	return {
		uid: "test-uid",
		tag: "test-component",
		protocolVersion: PROTOCOL_VERSION,
		context: CONTEXT.IFRAME,
		consumerDomain: "https://consumer.com",
		...overrides,
	};
}

/** Encodes any JSON value with the window-name envelope, as another version would. */
function encodeWindowName(value: unknown): string {
	return `${WINDOW_NAME_PREFIX}${btoa(encodeURIComponent(JSON.stringify(value)))}`;
}

/** Reads a window name through the host's payload reader. */
function readWindowName(name: string) {
	return readWindowNamePayload({ name } as Window);
}

describe("buildWindowName", () => {
	it("should create window name with prefix", () => {
		expect(buildWindowName(createPayload())).toMatch(
			new RegExp(`^${WINDOW_NAME_PREFIX}`),
		);
	});

	it("should encode payload as base64", () => {
		const name = buildWindowName(createPayload());
		const encoded = name.slice(WINDOW_NAME_PREFIX.length);

		// Should be valid base64
		expect(() => atob(encoded)).not.toThrow();
	});

	it("should throw when payload exceeds the maximum size limit", () => {
		expect(() =>
			buildWindowName(createPayload({ tag: "x".repeat(70 * 1024) })),
		).toThrow(
			expect.objectContaining({
				code: "CAPACITY",
				message: expect.stringContaining("exceeds maximum allowed size"),
			}),
		);
	});

	it("should wrap encoding failures with a descriptive error", () => {
		const circular = {} as Record<string, unknown>;
		circular.self = circular;

		expect(() =>
			buildWindowName({
				...createPayload(),
				circular,
			} as WindowNamePayload),
		).toThrow("Failed to encode payload");
	});

	it("should not depend on Blob when measuring encoded payload size", () => {
		vi.stubGlobal(
			"Blob",
			class {
				constructor() {
					throw new Error("Blob should not be used for payload size checks");
				}
			},
		);

		try {
			expect(() => buildWindowName(createPayload())).not.toThrow();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe("readWindowNamePayload", () => {
	it("should read current channel metadata", () => {
		const payload = createPayload({ context: CONTEXT.POPUP });

		expect(readWindowName(buildWindowName(payload))).toEqual({
			kind: "current",
			payload,
		});
	});

	it("should round-trip real non-ASCII payload values", () => {
		const payload = createPayload({ tag: "Héllo 世界 👋 café" });

		expect(readWindowName(buildWindowName(payload))).toEqual({
			kind: "current",
			payload,
		});
	});

	it("should return null for non-ForgeFrame names", () => {
		expect(readWindowName("some-other-name")).toBeNull();
		expect(readWindowName("")).toBeNull();
		expect(readWindowNamePayload({ name: 42 } as unknown as Window)).toBeNull();
	});

	it("should return null when reading the window name throws", () => {
		const win = {
			get name(): string {
				throw new DOMException("Blocked", "SecurityError");
			},
		} as Window;

		expect(readWindowNamePayload(win)).toBeNull();
	});

	it.each([
		["invalid base64", `${WINDOW_NAME_PREFIX}not-valid-base64!!!`],
		["invalid JSON", `${WINDOW_NAME_PREFIX}${btoa("not json")}`],
		[
			"an oversized name",
			encodeWindowName({ ...createPayload(), padding: "x".repeat(32 * 1024) }),
		],
	])("should classify %s as invalid", (_label, name) => {
		expect(readWindowName(name)).toEqual({ kind: "invalid" });
	});

	it("should never write the window name", () => {
		const name = buildWindowName(createPayload());
		const setName = vi.fn();
		const win = {
			get name() {
				return name;
			},
			set name(value: string) {
				setName(value);
			},
		} as unknown as Window;

		expect(readWindowNamePayload(win)?.kind).toBe("current");
		expect(setName).not.toHaveBeenCalled();
	});
});

describe("classifyWindowNamePayload", () => {
	it("should copy only the channel metadata from a current payload", () => {
		expect(
			classifyWindowNamePayload({
				...createPayload(),
				version: "2.0.0",
				props: { secret: "ignored" },
				exports: { init: "ignored" },
				children: { Child: { tag: "child", url: "https://child.test" } },
			}),
		).toEqual({ kind: "current", payload: createPayload() });
	});

	it.each([
		["no protocol version (0.x)", undefined, "0.9.0"],
		["protocol 1 (0.x)", 1, "0.10.0"],
		["protocol 2 (1.x)", 2, "1.1.0"],
		["a newer protocol", PROTOCOL_VERSION + 1, "3.0.0"],
	])(
		"should report a payload with %s as unsupported",
		(_label, protocolVersion, version) => {
			expect(
				classifyWindowNamePayload({
					uid: "test-uid",
					tag: "test-component",
					version,
					protocolVersion,
					context: CONTEXT.IFRAME,
					consumerDomain: "https://consumer.com",
					props: { amount: 10 },
					exports: { init: "forgeframe_init" },
				}),
			).toEqual({
				kind: "unsupported",
				tag: "test-component",
				protocolVersion,
				version,
			});
		},
	);

	it.each([
		["no package version", {}],
		["an empty package version", { version: "" }],
		["a non-string package version", { version: 1 }],
	])("should omit %s from an unsupported payload", (_label, version) => {
		expect(
			classifyWindowNamePayload({
				...createPayload(),
				protocolVersion: 2,
				...version,
			}),
		).toEqual({
			kind: "unsupported",
			tag: "test-component",
			protocolVersion: 2,
			version: undefined,
		});
	});

	it.each([
		["a non-object root", "invalid-root"],
		["a null root", null],
		["an undecodable value", undefined],
		["a missing tag", { ...createPayload(), tag: undefined }],
		["an empty tag", createPayload({ tag: "" })],
		["a string protocol", { ...createPayload(), protocolVersion: "3" }],
		["a null protocol", { ...createPayload(), protocolVersion: null }],
		["protocol 0", createPayload({ protocolVersion: 0 })],
		["a negative protocol", createPayload({ protocolVersion: -1 })],
		["a fractional protocol", createPayload({ protocolVersion: 2.5 })],
		["a missing uid", { ...createPayload(), uid: undefined }],
		["an empty uid", createPayload({ uid: "" })],
		["an invalid context", { ...createPayload(), context: "modal" }],
		["an empty consumer domain", createPayload({ consumerDomain: "" })],
		[
			"a missing consumer domain",
			{ ...createPayload(), consumerDomain: undefined },
		],
		["no protocol and only a tag", { tag: "test-component" }],
		[
			"protocol 2 and no uid",
			{ ...createPayload(), protocolVersion: 2, uid: undefined },
		],
		[
			"protocol 1 and an invalid context",
			{ ...createPayload(), protocolVersion: 1, context: "modal" },
		],
		[
			"no protocol and no consumer domain",
			{
				...createPayload(),
				protocolVersion: undefined,
				consumerDomain: undefined,
			},
		],
	])("should classify a payload with %s as invalid", (_label, value) => {
		expect(classifyWindowNamePayload(value)).toEqual({ kind: "invalid" });
	});

	it("should report a newer payload by its tag alone, since its other fields are unknown", () => {
		expect(
			classifyWindowNamePayload({
				tag: "test-component",
				protocolVersion: PROTOCOL_VERSION + 1,
			}),
		).toEqual({
			kind: "unsupported",
			tag: "test-component",
			protocolVersion: PROTOCOL_VERSION + 1,
			version: undefined,
		});
	});
});

describe("isForgeFrameWindow", () => {
	it("should return true for ForgeFrame window", () => {
		const win = { name: buildWindowName(createPayload()) } as Window;

		expect(isForgeFrameWindow(win)).toBe(true);
	});

	it("should return true for a ForgeFrame window from another protocol", () => {
		const win = {
			name: encodeWindowName({
				...createPayload({ protocolVersion: 2 }),
				version: "1.1.0",
			}),
		} as Window;

		expect(isForgeFrameWindow(win)).toBe(true);
	});

	it.each([
		["an undecodable payload", `${WINDOW_NAME_PREFIX}%%%not-base64`],
		["a payload without channel metadata", encodeWindowName({ tag: "x" })],
		["a prefix with no payload", WINDOW_NAME_PREFIX],
	])("should return false for %s after the prefix", (_label, name) => {
		expect(isForgeFrameWindow({ name } as Window)).toBe(false);
	});

	it("should return false for non-ForgeFrame window", () => {
		const win = { name: "regular-window" } as Window;
		expect(isForgeFrameWindow(win)).toBe(false);
	});

	it("should return false for window with empty name", () => {
		const win = { name: "" } as Window;
		expect(isForgeFrameWindow(win)).toBe(false);
	});

	it("should return false on cross-origin error", () => {
		const win = {
			get name() {
				throw new Error("Cross-origin");
			},
		} as unknown as Window;

		expect(isForgeFrameWindow(win)).toBe(false);
	});
});

describe("createWindowPayload", () => {
	it("should create channel metadata with the current protocol version", () => {
		expect(
			createWindowPayload({
				uid: "test-uid",
				tag: "test-tag",
				context: CONTEXT.IFRAME,
				consumerDomain: "https://consumer.com",
			}),
		).toEqual({
			uid: "test-uid",
			tag: "test-tag",
			protocolVersion: PROTOCOL_VERSION,
			context: CONTEXT.IFRAME,
			consumerDomain: "https://consumer.com",
		});
	});
});
