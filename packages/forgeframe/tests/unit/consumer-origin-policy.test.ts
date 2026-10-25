import { describe, expect, it } from "vitest";
import { validateMessagingConsumerContext } from "@/core/host/consumer-origin-policy";

describe("consumer origin policy from supplied evidence", () => {
	it.each([
		"https://consumer.test/path",
		"https://consumer.test/",
		"data:text/plain,hi",
		"null",
	])("rejects a non-exact messaging origin: %s", (origin) => {
		expect(() =>
			validateMessagingConsumerContext(origin, undefined, "widget"),
		).toThrow("Could not verify consumer origin");
	});
});
