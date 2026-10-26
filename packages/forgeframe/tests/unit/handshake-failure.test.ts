/**
 * Unit tests for the host's handshake failure classification.
 *
 * Covers the messenger's own acknowledgement timeout becoming INIT_TIMEOUT,
 * other ForgeFrame codes (including a CLOSED the consumer sent) kept, and
 * other values wrapped as VALIDATION with a cause.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Messenger } from "@/communication/messenger";
import { toHandshakeFailure } from "@/core/host/handshake-failure";
import { ForgeFrameError } from "@/errors";

afterEach(() => {
	vi.useRealTimers();
});

describe("toHandshakeFailure", () => {
	it("turns the messenger's own acknowledgement timeout into INIT_TIMEOUT", async () => {
		vi.useFakeTimers();
		const messenger = new Messenger("handshake-failure", window);
		const target = { postMessage: vi.fn() } as unknown as Window;
		const timedOut = messenger
			.send(target, "https://consumer.example.com", "forgeframe_init", {}, 5)
			.catch((error: unknown) => error);
		await vi.advanceTimersByTimeAsync(5);
		const timeout = await timedOut;
		messenger.destroy();

		expect(timeout).toMatchObject({ code: "CLOSED" });
		const failure = toHandshakeFailure(timeout);
		expect(failure).toMatchObject({ code: "INIT_TIMEOUT", cause: timeout });
	});

	it("keeps the code of a ForgeFrameError, including a CLOSED the consumer sent", () => {
		const closed = new ForgeFrameError(
			"CLOSED",
			"Component has been destroyed",
		);
		const rejected = new ForgeFrameError("ORIGIN_REJECTED", "not allowed");
		expect(toHandshakeFailure(closed)).toBe(closed);
		expect(toHandshakeFailure(rejected)).toBe(rejected);
	});

	it("wraps any other value as VALIDATION with the original as cause", () => {
		const failure = toHandshakeFailure("bad response");
		expect(failure).toMatchObject({
			code: "VALIDATION",
			message: "bad response",
		});
		expect((failure.cause as Error).cause).toBe("bad response");
	});
});
