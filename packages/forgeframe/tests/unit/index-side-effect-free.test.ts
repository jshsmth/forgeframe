/**
 * Integration-style test for public entrypoint side effects.
 *
 * Covers module import safety of both entries (`forgeframe` and
 * `forgeframe/react`) and explicit host initialization when
 * ForgeFrame-shaped window payloads are present in host-like window contexts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTEXT, PROTOCOL_VERSION } from "@/constants";
import { buildWindowName } from "@/window/name-payload";
import type { WindowNamePayload } from "@/window/types";

const originalWindowName = window.name;

afterEach(async () => {
	const { clearHostInstance } = await import("@/core/host");
	clearHostInstance();
	window.name = originalWindowName;
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("Index side effects", () => {
	it("should not initialize host state until initHost() is called explicitly", async () => {
		const payload: WindowNamePayload = {
			uid: "index-side-effect-free-uid",
			tag: "index-side-effect-free-component",
			protocolVersion: PROTOCOL_VERSION,
			context: CONTEXT.IFRAME,
			consumerDomain: "https://consumer.example.com",
		};
		const bootstrapWindowName = buildWindowName(payload);

		window.name = bootstrapWindowName;
		vi.resetModules();
		const hostSecurity = await import("@/core/host/security");
		const { Messenger } = await import("@/communication/messenger");
		const resolveConsumerWindowSpy = vi
			.spyOn(hostSecurity, "resolveConsumerWindow")
			.mockReturnValue(window);
		const sendSpy = vi
			.spyOn(Messenger.prototype, "send")
			.mockResolvedValue(undefined);

		const publicEntrypoint = await import("@/index");
		await import("@/react");

		const { getHost } = await import("@/core/host");

		expect(resolveConsumerWindowSpy).not.toHaveBeenCalled();
		expect(sendSpy).not.toHaveBeenCalled();
		expect(getHost()).toBeNull();
		expect(Object.hasOwn(window, "hostProps")).toBe(false);

		// The stubbed consumer is this window, whose readable origin wins.
		const host = publicEntrypoint.initHost({
			consumerOrigins: window.location.origin,
		});

		expect(host).not.toBeNull();
		expect(getHost()?.hostProps).toBe(host?.hostProps);
		expect(window.name).toBe(bootstrapWindowName);
		expect(publicEntrypoint.isHost()).toBe(true);
		expect(Object.hasOwn(window, "hostProps")).toBe(false);
	});
});
