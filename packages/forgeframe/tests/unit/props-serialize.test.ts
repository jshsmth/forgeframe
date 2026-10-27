/**
 * Unit tests for `@/props/serialize`.
 *
 * Covers the props codec's own root rules: undefined key omission and the
 * prototype-safety filter on decode, which only a crafted message reaches.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { FunctionBridge } from "@/communication/bridge";
import { Messenger } from "@/communication/messenger";
import { deserializeProps, serializeProps } from "@/props/serialize";
import type { SerializedProps } from "@/props/types";

/**
 * Creates a bridge backed by an inert messenger that never listens.
 */
function createBridgeWithMessenger() {
	const messenger = new Messenger(
		"props-serialize",
		window,
		window.location.origin,
		undefined,
		false,
	);

	return {
		// These codec tests admit every caller; they check decoding, not sources.
		bridge: new FunctionBridge(messenger, () => true),
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Props serialization behavior", () => {
	it("should skip undefined keys while serializing props", () => {
		const { bridge } = createBridgeWithMessenger();
		const serialized = serializeProps<{
			defined: string;
			missing?: string | undefined;
		}>(
			{
				defined: "ok",
				missing: undefined,
			},
			bridge,
		);

		expect(serialized).toEqual({ defined: "ok" });
		expect("missing" in serialized).toBe(false);
	});

	it("should block __proto__ while preserving safe top-level keys during deserialization", () => {
		const { bridge } = createBridgeWithMessenger();
		const serialized: SerializedProps = {
			safe: "ok",
			["__proto__"]: "unsafe",
			constructor: "allowed-constructor",
			prototype: "allowed-prototype",
		};

		const deserialized = deserializeProps(
			serialized,
			bridge,
			window,
			"https://consumer.example.com",
		) as Record<string, unknown>;

		expect(deserialized.safe).toBe("ok");
		expect(Object.getPrototypeOf(deserialized)).toBe(Object.prototype);
		expect(Object.hasOwn(deserialized, "__proto__")).toBe(false);
		expect(Object.hasOwn(deserialized, "constructor")).toBe(true);
		expect(Object.hasOwn(deserialized, "prototype")).toBe(true);
		expect(deserialized.constructor).toBe("allowed-constructor");
		expect(deserialized.prototype).toBe("allowed-prototype");
	});
});
