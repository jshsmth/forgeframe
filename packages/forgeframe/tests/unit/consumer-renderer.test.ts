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

describe("ConsumerRenderer popup loading completion", () => {
	it.each(["default", "custom", "null"])(
		"should remove %s loading content while preserving the caller mount",
		async (template) => {
			const mount = document.createElement("div");
			const sibling = document.createElement("button");
			mount.appendChild(sibling);
			document.body.appendChild(mount);
			const shell = document.createElement("section");
			const control = document.createElement("button");
			shell.appendChild(control);
			const renderer = createRenderer({
				defaultContext: CONTEXT.POPUP,
				...(template === "custom"
					? {
							containerTemplate: ({ prerenderFrame }) => {
								if (prerenderFrame) shell.appendChild(prerenderFrame);
								return shell;
							},
						}
					: {}),
				...(template === "null" ? { prerenderTemplate: () => null } : {}),
			});
			renderer.container = mount;
			await renderer.prerender(
				() => {
					throw new Error("Popup must not create an iframe");
				},
				() => "popup-loading",
				() => undefined,
			);
			const loader = renderer.prerenderElement;
			await renderer.completePrerender();
			expect(renderer.prerenderElement).toBeNull();
			expect(loader?.isConnected ?? false).toBe(false);
			expect(mount.contains(sibling)).toBe(true);
			expect(renderer.container).toBe(template === "custom" ? shell : mount);
			if (template === "custom") {
				expect(mount.contains(shell)).toBe(true);
				expect(shell.contains(control)).toBe(true);
			} else {
				expect([...mount.children]).toEqual([sibling]);
			}
			await renderer.completePrerender();
			renderer.destroy(null);
			renderer.destroy(null);
			expect(mount.isConnected).toBe(true);
			expect(mount.contains(sibling)).toBe(true);
			expect(shell.isConnected).toBe(false);
		},
	);

	it("should keep completion safe when removing the loader triggers teardown", async () => {
		const mount = document.createElement("div");
		document.body.appendChild(mount);
		const renderer = createRenderer({ defaultContext: CONTEXT.POPUP });
		renderer.container = mount;
		await renderer.prerender(
			() => {
				throw new Error("Unexpected iframe");
			},
			() => "popup-loading",
			() => undefined,
		);
		const loader = renderer.prerenderElement;
		if (!loader) throw new Error("Missing popup loader");
		vi.spyOn(loader, "remove").mockImplementationOnce(() =>
			renderer.destroy(null),
		);
		await renderer.completePrerender();
		expect(renderer.container).toBeNull();
		expect(mount.children).toHaveLength(0);
	});
});

describe("ConsumerRenderer configured iframe loading styles", () => {
	it.each([
		[undefined, "none"],
		["eager", "none"],
		["lazy", "block"],
	] as const)(
		"conceals loading %s frames with display %s and restores caller styles",
		async (loading, display) => {
			vi.useFakeTimers();
			const mount = document.createElement("div");
			document.body.appendChild(mount);
			const renderer = createRenderer({
				attributes: { loading },
				style: { display: "block" },
				containerTemplate: ({ container }) => container,
			});
			renderer.container = mount;
			try {
				await renderer.prerender(
					(name) => {
						const frame = renderer.createIframeElement(name);
						// jsdom does not reflect the iframe loading attribute as a property.
						Object.defineProperty(frame, "loading", {
							value: loading ?? "eager",
						});
						return frame;
					},
					() => "loading-layout",
					() => undefined,
				);
				const frame = renderer.iframe;
				if (!frame) throw new Error("Missing iframe");
				expect(frame.style.display).toBe(display);
				expect(frame.style.visibility).toBe("hidden");
				const completion = renderer.completePrerender();
				await vi.runAllTimersAsync();
				await completion;
				expect(frame.style.display).toBe("block");
				expect(frame.style.visibility).toBe("visible");
			} finally {
				renderer.destroy(null);
				vi.useRealTimers();
			}
		},
	);

	it.each(["show", "hide"] as const)(
		"retains an eager frame %s requested before creation through loading completion",
		async (control) => {
			vi.useFakeTimers();
			const mount = document.createElement("div");
			document.body.appendChild(mount);
			const renderer = createRenderer({ style: { display: "block" } });
			renderer.container = mount;
			renderer[control]();
			try {
				await renderer.prerender(
					(name) => renderer.createIframeElement(name),
					() => "early-eager-control",
					() => undefined,
				);
				const frame = renderer.iframe;
				if (!frame) throw new Error("Missing iframe");
				expect(frame.style.display).toBe(control === "hide" ? "none" : "");
				expect(frame.style.visibility).toBe(
					control === "hide" ? "hidden" : "visible",
				);
				const completion = renderer.completePrerender();
				await vi.runAllTimersAsync();
				await completion;
				expect(frame.style.display).toBe(control === "hide" ? "none" : "");
				expect(frame.style.visibility).toBe(
					control === "hide" ? "hidden" : "visible",
				);
			} finally {
				renderer.destroy(null);
				vi.useRealTimers();
			}
		},
	);

	it.each([
		["visibility", "hidden"],
		["display", "none"],
		["display", "block"],
		["opacity", "0"],
		["opacity", "0.25"],
		["transition", "transform 2s"],
	] as const)(
		"retains configured %s: %s while completing the loading transition",
		async (property, value) => {
			vi.useFakeTimers();
			const mount = document.createElement("div");
			document.body.appendChild(mount);
			const renderer = createRenderer({ style: { [property]: value } });
			renderer.container = mount;
			try {
				await renderer.prerender(
					(name) => renderer.createIframeElement(name),
					() => "configured-loading-styles",
					() => undefined,
				);
				const frame = renderer.iframe;
				if (!frame) throw new Error("Missing iframe");
				const completion = renderer.completePrerender();
				// Sample after loader removal, when an unconditional frame fade used
				// to override configured concealment, opacity, display and transition.
				await vi.advanceTimersByTimeAsync(151);
				expect(frame.style.getPropertyValue(property)).toBe(value);
				await vi.runAllTimersAsync();
				await completion;
				expect(frame.style.getPropertyValue(property)).toBe(value);
				expect(renderer.prerenderElement).toBeNull();
			} finally {
				renderer.destroy(null);
				vi.useRealTimers();
			}
		},
	);
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

	it("removes the transient form when native submission throws", () => {
		const renderer = createRenderer();
		const failure = new Error("submission failed");
		vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {
			throw failure;
		});
		expect(() =>
			renderer.submitBodyForm(
				"target",
				"https://host.example/widget",
				new URLSearchParams({
					submit: "token",
					remove: "cleanup",
					appendChild: "field",
					extra: "last",
				}),
			),
		).toThrow(failure);
		expect(document.querySelector("form")).toBeNull();
	});

	it("submits through the mount document's form prototype", () => {
		const iframe = document.createElement("iframe");
		document.body.appendChild(iframe);
		const doc = iframe.contentDocument;
		if (!doc) throw new Error("Missing iframe document");
		const mount = doc.createElement("div");
		doc.body.appendChild(mount);
		const renderer = createRenderer();
		renderer.container = mount;
		const prototype = Object.getPrototypeOf(
			doc.createElement("form"),
		) as HTMLFormElement;
		const submit = vi
			.spyOn(prototype, "submit")
			.mockImplementation(() => undefined);
		renderer.submitBodyForm(
			"target",
			"https://host.example/widget",
			new URLSearchParams({ submit: "abc" }),
		);
		expect(submit).toHaveBeenCalledTimes(1);
		expect(doc.querySelector("form")).toBeNull();
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
