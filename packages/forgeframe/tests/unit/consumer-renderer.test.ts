import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTEXT } from "@/constants";
import { ConsumerRenderer } from "@/core/consumer/renderer";
import type { NormalizedOptions } from "@/core/consumer/types";

function createRenderer(
	options: Partial<NormalizedOptions<Record<string, unknown>>> = {},
): ConsumerRenderer<Record<string, unknown>> {
	const dimensions = { width: 320, height: 180 };
	const normalizedOptions: NormalizedOptions<Record<string, unknown>> = {
		tag: "consumer-renderer-test",
		url: "https://host.example.com/widget",
		props: {},
		defaultContext: CONTEXT.IFRAME,
		dimensions,
		timeout: 1000,
		...options,
	};

	return new ConsumerRenderer(
		normalizedOptions,
		"renderer-test-uid",
		() => ({}),
		() => dimensions,
		{
			close: vi.fn().mockResolvedValue(undefined),
			focus: vi.fn().mockResolvedValue(undefined),
		},
	);
}

afterEach(() => {
	vi.restoreAllMocks();
	document.body.innerHTML = "";
	document.getElementById("forgeframe-spinner-style")?.remove();
});

describe("ConsumerRenderer teardown", () => {
	it("should remove renderer-owned wrapper containers on destroy", async () => {
		const mountContainer = document.createElement("div");
		document.body.appendChild(mountContainer);

		const renderer = createRenderer();
		renderer.container = mountContainer;

		await renderer.prerender(
			(windowName) => renderer.createIframeElement(windowName),
			() => "renderer-test-frame",
			() => undefined,
		);

		expect(
			mountContainer.querySelector("#forgeframe-container-renderer-test-uid"),
		).toBeInstanceOf(HTMLElement);

		renderer.destroy(null);

		expect(mountContainer.childElementCount).toBe(0);
		expect(
			mountContainer.querySelector("#forgeframe-container-renderer-test-uid"),
		).toBeNull();
		expect(renderer.container).toBeNull();
	});

	it("should preserve caller-owned containers on destroy", async () => {
		const mountContainer = document.createElement("div");
		document.body.appendChild(mountContainer);

		const renderer = createRenderer({
			containerTemplate: ({ container }) => container,
			prerenderTemplate: () => null,
		});
		renderer.container = mountContainer;

		await renderer.prerender(
			(windowName) => renderer.createIframeElement(windowName),
			() => "renderer-test-frame",
			() => undefined,
		);

		expect(mountContainer.querySelector("iframe")).toBeInstanceOf(
			HTMLIFrameElement,
		);

		renderer.destroy(null);

		expect(document.body.contains(mountContainer)).toBe(true);
		expect(mountContainer.childElementCount).toBe(0);
	});
});

describe("ConsumerRenderer submitBodyForm", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		document.body.innerHTML = "";
	});

	it("should create a hidden POST form, submit it, and remove it afterwards", () => {
		const mountContainer = document.createElement("div");
		document.body.appendChild(mountContainer);

		const renderer = createRenderer();
		renderer.container = mountContainer;

		const submitSpy = vi
			.spyOn(HTMLFormElement.prototype, "submit")
			.mockImplementation(() => undefined);

		const params = new URLSearchParams({
			token: "abc123",
			mode: "popup",
		});

		renderer.submitBodyForm(
			"forgeframe-target",
			"https://host.example.com/widget?mode=popup",
			params,
		);

		expect(submitSpy).toHaveBeenCalledTimes(1);

		const submittedForm = submitSpy.mock.instances[0] as HTMLFormElement;
		expect(submittedForm.method).toBe("post");
		expect(submittedForm.action).toBe(
			"https://host.example.com/widget?mode=popup",
		);
		expect(submittedForm.target).toBe("forgeframe-target");
		expect(submittedForm.style.display).toBe("none");
		expect(
			Array.from(submittedForm.querySelectorAll("input")).map((input) => ({
				name: input.name,
				value: input.value,
			})),
		).toEqual([
			{ name: "token", value: "abc123" },
			{ name: "mode", value: "popup" },
		]);
		expect(document.body.querySelector("form")).toBeNull();
	});

	it("should throw when no document root is available for form submission", () => {
		const renderer = createRenderer();
		const fakeDocument = {
			body: null,
			documentElement: null,
			createElement: document.createElement.bind(document),
		} as unknown as Document;

		renderer.container = {
			ownerDocument: fakeDocument,
		} as HTMLElement;

		expect(() =>
			renderer.submitBodyForm(
				"forgeframe-target",
				"https://host.example.com/widget",
				new URLSearchParams({ token: "abc123" }),
			),
		).toThrow("Document root is unavailable for bodyParam form submission");
	});
});
