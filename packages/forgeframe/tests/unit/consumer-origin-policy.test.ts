import { describe, expect, it } from "vitest";
import {
	assertAllowedConsumerOrigin,
	validateMessagingConsumerContext,
} from "@/core/host/consumer-origin-policy";
import { forgeFrameError } from "../forgeframe-error";

describe("consumer origin policy from supplied evidence", () => {
	it.each([
		"https://consumer.test/path",
		"https://consumer.test/",
		"data:text/plain,hi",
		"null",
	])("rejects a non-exact messaging origin: %s", (origin) => {
		expect(() =>
			validateMessagingConsumerContext(origin, "*", "widget"),
		).toThrow(
			expect.objectContaining({
				code: "ORIGIN_REJECTED",
				message: "Could not verify consumer origin",
			}),
		);
	});

	it("rejects an empty supplied origin before matching it, even against '*'", () => {
		expect(() => assertAllowedConsumerOrigin("*", "", "widget")).toThrow(
			forgeFrameError(
				"ORIGIN_REJECTED",
				'Could not verify consumer origin for component "widget"',
			),
		);
	});

	it("rejects a suffix-confusion origin and admits a matching subdomain", () => {
		expect(() =>
			assertAllowedConsumerOrigin(
				"https://*.consumer.test",
				"https://consumer.test.evil.test",
				"widget",
			),
		).toThrow(
			forgeFrameError("ORIGIN_REJECTED", "is not allowed by consumerOrigins"),
		);
		expect(() =>
			assertAllowedConsumerOrigin(
				"https://*.consumer.test",
				"https://shop.consumer.test",
				"widget",
			),
		).not.toThrow();
	});
});
