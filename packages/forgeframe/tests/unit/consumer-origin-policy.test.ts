import { describe, expect, it } from "vitest";
import {
	assertVerifiedConsumerContext,
	selectConsumerSecurityContext,
	selectObservedConsumerContext,
	validateMessagingConsumerContext,
} from "@/core/host/consumer-origin-policy";

describe("consumer origin policy from supplied evidence", () => {
	it("uses verified evidence rather than the claimed origin", () => {
		expect(
			selectConsumerSecurityContext(
				{
					claimedConsumerDomain: "https://claimed.test",
					allowedConsumerDomains: "https://verified.test",
					tag: "widget",
				},
				"https://verified.test",
			),
		).toEqual({
			consumerDomain: "https://verified.test",
			consumerDomainVerified: true,
		});
	});
	it("requires verification when an allowlist is configured", () => {
		expect(() =>
			selectConsumerSecurityContext(
				{
					claimedConsumerDomain: "https://claimed.test",
					allowedConsumerDomains: "*",
					tag: "widget",
				},
				null,
			),
		).toThrow('Could not verify consumer origin for component "widget"');
		expect(
			selectConsumerSecurityContext(
				{ claimedConsumerDomain: "https://claimed.test", tag: "widget" },
				null,
			),
		).toEqual({
			consumerDomain: "https://claimed.test",
			consumerDomainVerified: false,
		});
	});
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
	it("does not upgrade an unverified claim without new evidence", () => {
		const previous = {
			consumerDomain: "https://consumer.test",
			consumerDomainVerified: false,
		};
		const context = selectObservedConsumerContext(null, previous);
		expect(context).toEqual(previous);
		expect(() => assertVerifiedConsumerContext(context, "*", "widget")).toThrow(
			"Could not verify consumer origin",
		);
		expect(selectObservedConsumerContext("https://new.test", previous)).toEqual(
			{ consumerDomain: "https://new.test", consumerDomainVerified: true },
		);
	});
});
