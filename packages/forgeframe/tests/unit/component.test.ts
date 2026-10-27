/**
 * Unit tests for `@/core/component` and host context helpers.
 *
 * Covers component registration, instance lifecycle, dynamic option materialization, and host detection behavior.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CONTEXT, EVENT } from "@/constants";
import {
	clearComponents,
	closeAll,
	create,
	getComponent,
	unregisterComponent,
} from "@/core/component";
import { getComponentOptions } from "@/core/component-registry";
import { getPeerInstances } from "@/core/consumer/peers";
import { clearHostInstance, isHost } from "@/core/host";
import { prop } from "@/props/prop";
import type { ComponentOptions } from "@/types";
import { forgeFrameError } from "../forgeframe-error";
import {
	PEER_HOST_ORIGIN,
	setOpenedHostOrigin,
	setVerifiedHostOrigin,
} from "../peer-host-origin";
import { checkRenderValidation } from "../render-validation";

const originalWindowName = window.name;

type ConsumerInternals = {
	renderer: {
		context: string;
		resize: (...args: unknown[]) => void;
	};
	transport: {
		hostWindow: Window | null;
		messenger: {
			allowedOrigins: Set<string>;
		};
	};
	propsPipeline: {
		props: Record<string, unknown>;
	};
	waitForHost: () => Promise<void>;
	prerender: () => Promise<void>;
	open: () => Promise<void>;
	resolveUrl: () => string;
	resolveDimensions: () => { width: number | string; height: number | string };
};

function getConsumerInternals(instance: unknown): ConsumerInternals {
	return instance as ConsumerInternals;
}

/**
 * Returns a component option patch that the types reject, typed as `object` so
 * it can reach create() as an untyped caller's would. A patch the types accept
 * fails to compile here, so each invalid-input row stays invalid.
 */
function rejectedByTypes<T extends object>(
	patch: T &
		([T] extends [Partial<ComponentOptions<Record<string, unknown>>>]
			? never
			: unknown),
): object {
	return patch;
}

describe("Component Creation", () => {
	const initTimeoutRange =
		"Component initTimeout must be a finite number between 0 and 2147483647 milliseconds";
	// Values the types accept, or spread past the excess property check, but
	// the runtime rejects.
	it.each([
		{ patch: { initTimeout: Infinity }, message: initTimeoutRange },
		{ patch: { initTimeout: NaN }, message: initTimeoutRange },
		{ patch: { initTimeout: -1 }, message: initTimeoutRange },
		{ patch: { initTimeout: 2147483648 }, message: initTimeoutRange },
		{
			patch: { timeout: 1 },
			message: 'Component option "timeout" was renamed. Use initTimeout',
		},
		{
			patch: { cspNonce: "" },
			message: "Component cspNonce must be a non-empty string",
		},
	])(
		"rejects invalid JavaScript configuration before registration: $patch",
		({ patch, message }) => {
			expect(() =>
				create({
					tag: "invalid-runtime-options",
					url: "https://example.com",
					...patch,
				}),
			).toThrow(forgeFrameError("VALIDATION", message));
			expect(getComponent("invalid-runtime-options")).toBeUndefined();
		},
	);
	// Values the types reject too, as untyped JavaScript callers can pass them.
	it.each([
		{
			patch: rejectedByTypes({ url: 123 }),
			message: "Component url must be a string or a function",
		},
		{
			patch: rejectedByTypes({ url: {} }),
			message: "Component url must be a string or a function",
		},
		{
			patch: rejectedByTypes({ tag: ["valid-tag"] }),
			message: 'Invalid component tag "valid-tag"',
		},
		{
			patch: rejectedByTypes({ context: "unsupported" }),
			message: 'Component context must be "iframe" or "popup"',
		},
		{
			patch: rejectedByTypes({ initTimeout: "1000" }),
			message: initTimeoutRange,
		},
	])(
		"rejects invalid JavaScript configuration before registration: $patch",
		({ patch, message }) => {
			const options = {
				tag: "invalid-runtime-options",
				url: "https://example.com",
				...patch,
			};
			expect(() => create(options)).toThrow(
				forgeFrameError("VALIDATION", message),
			);
			expect(getComponent("invalid-runtime-options")).toBeUndefined();
		},
	);
	it.each([0, 2147483647])(
		"accepts the initTimeout bound %d",
		(initTimeout) => {
			expect(() =>
				create({
					tag: `init-timeout-bound-${initTimeout}`,
					url: "https://example.com",
					initTimeout,
				}),
			).not.toThrow();
		},
	);
	it("rejects an invalid render context without allocating resources and permits retry", async () => {
		const Component = create({
			tag: "invalid-render-context",
			url: "https://example.com",
		});
		const instance = Component({});
		const container = document.createElement("div");
		document.body.append(container);
		await expect(
			instance.render(
				container,
				// @ts-expect-error An unsupported render context.
				"unsupported",
			),
		).rejects.toThrow(forgeFrameError("VALIDATION", "Render context"));
		expect(container.children).toHaveLength(0);
		vi.spyOn(getConsumerInternals(instance), "waitForHost").mockResolvedValue(
			undefined,
		);
		await expect(
			instance.render(container, CONTEXT.IFRAME),
		).resolves.toBeUndefined();
		await instance.close();
		container.remove();
	});
	afterEach(() => {
		clearComponents();
	});

	it("should create a component with basic options", () => {
		const MyComponent = create({
			tag: "my-component",
			url: "https://example.com/component",
		});

		expect(typeof MyComponent).toBe("function");
		expect(MyComponent.instances).toEqual([]);
		expect(getComponent("my-component")).toBe(MyComponent);
	});

	it("should allow relative string urls in browser environments", () => {
		const MyComponent = create({
			tag: "relative-url-component",
			url: "/component.html",
		});

		expect(getComponent("relative-url-component")).toBe(MyComponent);
	});

	it.each([
		"javascript:alert(1)",
		"data:text/html,unsafe",
		"blob:https://example.com/id",
	])("should reject unsupported host URL %s", (url) => {
		expect(() =>
			create({ tag: `unsafe-url-${url.split(":")[0]}`, url }),
		).toThrow(
			forgeFrameError("VALIDATION", "Only http: and https: are supported"),
		);
	});

	it("should enforce domain as a host URL allowlist", () => {
		expect(() =>
			create({
				tag: "domain-policy-component",
				url: "https://attacker.example.com/widget",
				hostOrigins: "https://trusted.example.com",
			}),
		).toThrow(
			forgeFrameError(
				"ORIGIN_REJECTED",
				"is not allowed by the component's hostOrigins",
			),
		);
	});

	it("should validate function URLs before rendering them", async () => {
		const DynamicComponent = create({
			tag: "dynamic-unsafe-url-component",
			hostOrigins: "*",
			url: () => "javascript:alert(1)",
		});
		const instance = DynamicComponent({});

		await expect(
			instance.render(document.createElement("div")),
		).rejects.toMatchObject({
			code: "VALIDATION",
			message: expect.stringContaining("Only http: and https: are supported"),
		});
		// Nothing opened, so the instance stays open and can render again.
		expect(DynamicComponent.instances).toEqual([instance]);
	});

	it("should retry rendering after a transient function URL failure", async () => {
		const transientError = new Error("Application state is not ready");
		let ready = false;
		const resolveUrl = vi.fn(() => {
			if (!ready) {
				throw transientError;
			}
			return "https://example.com/component";
		});
		const DynamicComponent = create({
			tag: "retryable-dynamic-url-component",
			hostOrigins: "https://example.com",
			url: resolveUrl,
		});
		const instance = DynamicComponent({});
		const internal = getConsumerInternals(instance);
		const container = document.createElement("div");

		document.body.appendChild(container);
		vi.spyOn(internal, "waitForHost").mockResolvedValue(undefined);

		await expect(instance.render(container)).rejects.toBe(transientError);
		expect(DynamicComponent.instances).toContain(instance);

		ready = true;

		await expect(instance.render(container)).resolves.toBeUndefined();
		expect(resolveUrl).toHaveBeenCalledTimes(2);
	});

	it("should render and update components without custom props definitions", async () => {
		const MyComponent = create({
			tag: "no-custom-props-component",
			url: "https://example.com/component",
		});
		const instance = MyComponent({});
		const internal = getConsumerInternals(instance);
		const container = document.createElement("div");

		document.body.appendChild(container);

		vi.spyOn(internal, "waitForHost").mockResolvedValue(undefined);

		await expect(instance.render(container)).resolves.toBeUndefined();
		internal.transport.hostWindow = null;
		await expect(instance.updateProps({})).resolves.toBeUndefined();

		// Only declared props are normalized; there are no hidden built-ins.
		expect(internal.propsPipeline.props).toEqual({});

		await instance.close();
		container.remove();
	});

	it("should validate required props on render and preserve function props on valid instances", async () => {
		const MyComponent = create({
			tag: "my-component-with-props",
			url: "https://example.com/component",
			props: {
				email: { schema: prop.string() },
				onLogin: prop.function(),
			},
		});
		const onLogin = vi.fn();
		// @ts-expect-error Deliberately omit a required input to exercise the runtime guard.
		const invalidInstance = MyComponent({ onLogin });
		const container = document.createElement("div");

		await expect(invalidInstance.render(container)).rejects.toThrow(
			forgeFrameError("VALIDATION", "Validation failed: email: Required"),
		);

		const instance = MyComponent({
			email: "user@example.com",
			onLogin,
		});
		const internalProps = getConsumerInternals(instance).propsPipeline
			.props as {
			email: string;
			onLogin: typeof onLogin;
		};

		expect(internalProps).toMatchObject({
			email: "user@example.com",
		});
		expect(internalProps.onLogin).toBe(onLogin);
	});

	it("should throw error for invalid tag", () => {
		expect(() =>
			create({
				tag: "Invalid-Tag",
				url: "https://example.com",
			}),
		).toThrow(forgeFrameError("VALIDATION", "Invalid component tag"));
	});

	it("should throw error for missing tag", () => {
		expect(() =>
			create({
				tag: "",
				url: "https://example.com",
			}),
		).toThrow(forgeFrameError("VALIDATION", "Component tag is required"));
	});

	it("should throw error for missing url", () => {
		expect(() =>
			create({
				tag: "my-component",
				url: "",
			}),
		).toThrow(forgeFrameError("VALIDATION", "Component url is required"));
	});

	it.each([
		{ option: "hostOrigins", value: "" },
		{ option: "hostOrigins", value: " " },
		{ option: "peers", value: ["https://partner.example.com", ""] },
		{ option: "peers", value: null },
	] as const)(
		"rejects $option values that would disable its origin policy: $value",
		({ option, value }) => {
			expect(() =>
				create({
					tag: "invalid-domain-matcher-component",
					url: "https://host.example.com/widget",
					// Invalid JavaScript configuration is rejected at runtime.
					...({ [option]: value } as object),
				}),
			).toThrow(
				forgeFrameError(
					"VALIDATION",
					`Component ${option} must be a non-empty origin string, a RegExp, or an array of them`,
				),
			);
		},
	);

	it.each(["hostOrigins", "peers"])(
		"rejects an empty %s array, which would match no origin",
		(option) => {
			expect(() =>
				create({
					tag: "empty-domain-matcher-component",
					url: "https://host.example.com/widget",
					...({ [option]: [] } as object),
				}),
			).toThrow(
				forgeFrameError(
					"VALIDATION",
					`Component ${option} must list at least one origin; an empty array matches none`,
				),
			);
			expect(getComponent("empty-domain-matcher-component")).toBeUndefined();
		},
	);

	it.each([
		{ options: { hostOrigins: "https://Host.example.com" } },
		{ options: { peers: ["https://host.example.com:443"] } },
		{
			options: {
				props: {
					token: {
						schema: prop.string(),
						deliverTo: "https://Host.example.com",
					},
				},
			},
		},
	])("rejects an origin browsers never report in $options", ({ options }) => {
		expect(() =>
			create({
				tag: "non-canonical-origin-component",
				url: "https://host.example.com/widget",
				...(options as object),
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'browsers report it as "https://host.example.com"',
			),
		);
		expect(getComponent("non-canonical-origin-component")).toBeUndefined();
	});

	it("rejects peers: false and names the way to keep discovery off", () => {
		expect(() =>
			create({
				tag: "false-peers-component",
				url: "https://host.example.com/widget",
				...({ peers: false } as object),
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Component peers must be "same-origin" or an origin matcher; omit it to keep peer discovery off',
			),
		);
	});

	it("rejects peers: true with the renamed same-origin value", () => {
		expect(() =>
			create({
				tag: "true-peers-component",
				url: "https://host.example.com/widget",
				...({ peers: true } as object),
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Component peers: true was renamed. Use peers: "same-origin", as deliverTo spells it.',
			),
		);
	});

	it("rejects the removed peerDomains option with its migration", () => {
		expect(() =>
			create({
				tag: "removed-peer-domains-component",
				url: "https://host.example.com/widget",
				...({ peerDomains: "https://partner.example.com" } as object),
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Component option "peerDomains" was removed. Peer discovery is opt-in: set peers: "same-origin" for same-origin peers, or peers: <origin matcher> to also admit those host origins.',
			),
		);
	});

	it("requires domain when url is a function", () => {
		expect(() =>
			// @ts-expect-error A function url requires hostOrigins.
			create({
				tag: "function-url-without-domain",
				url: () => "https://host.example.com/widget",
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				"Component hostOrigins is required when url is a function: list the host origins the function may return, or pass '*' to trust any http(s) origin.",
			),
		);
		expect(getComponent("function-url-without-domain")).toBeUndefined();
	});

	it.each([
		["a plain object", { ready: true }],
		["a function", () => true],
		["a string", "object"],
	])("rejects %s as the exports schema", (_label, exports) => {
		expect(() =>
			create({
				tag: "invalid-exports-schema",
				url: "https://host.example.com/widget",
				// @ts-expect-error None of these is a Standard Schema.
				exports,
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				"Component exports must be a Standard Schema, such as prop.object({ ... }) or a Zod object",
			),
		);
		expect(getComponent("invalid-exports-schema")).toBeUndefined();
	});

	it.each([
		[
			"a number",
			1,
			"Component sandbox must be a string of sandbox tokens, or false to write no sandbox attribute",
		],
		[
			"true",
			true,
			"Component sandbox must be a string of sandbox tokens, or false to write no sandbox attribute",
		],
		["an empty string", "", 'Component sandbox must include "allow-scripts"'],
		[
			"no allow-scripts",
			"allow-same-origin allow-forms",
			'Component sandbox must include "allow-scripts"',
		],
		[
			"no allow-same-origin",
			"allow-scripts allow-forms",
			'Component sandbox must include "allow-same-origin"',
		],
	])("rejects a sandbox with %s", (_label, sandbox, message) => {
		expect(() =>
			create({
				tag: "invalid-sandbox-component",
				url: "https://host.example.com/widget",
				...({ sandbox } as object),
			}),
		).toThrow(forgeFrameError("VALIDATION", message));
		expect(getComponent("invalid-sandbox-component")).toBeUndefined();
	});

	it("accepts sandbox tokens in any letter case and ASCII whitespace", () => {
		expect(() =>
			create({
				tag: "mixed-case-sandbox-component",
				url: "https://host.example.com/widget",
				sandbox: "ALLOW-SCRIPTS\tAllow-Same-Origin\nallow-modals",
			}),
		).not.toThrow();
	});

	it.each(["sandbox", "Sandbox", "SANDBOX"])(
		"rejects a static %s iframe attribute and points to the sandbox option",
		(key) => {
			expect(() =>
				create({
					tag: "attribute-sandbox-component",
					url: "https://host.example.com/widget",
					attributes: { [key]: "allow-scripts" } as Record<string, string>,
				}),
			).toThrow(
				forgeFrameError(
					"VALIDATION",
					`Iframe attribute "${key}" is not allowed; set the component's sandbox option instead`,
				),
			);
			expect(getComponent("attribute-sandbox-component")).toBeUndefined();
		},
	);

	it.each([["https://shop.example.com"], [[]], [null]])(
		"rejects the removed allowedConsumerDomains option (%j) with its migration",
		(value) => {
			expect(() =>
				create({
					tag: "removed-allowlist-component",
					url: "https://host.example.com/widget",
					// Invalid JavaScript configuration is rejected at runtime.
					...({ allowedConsumerDomains: value } as object),
				}),
			).toThrow(
				forgeFrameError(
					"VALIDATION",
					'Component option "allowedConsumerDomains" was removed. Pass the allowlist to the host instead: initHost(Component, { consumerOrigins }).',
				),
			);
			expect(getComponent("removed-allowlist-component")).toBeUndefined();
		},
	);

	it.each(["onError", "close", "children"])(
		"omits an undefined reserved definition for %s during declaration",
		(key) => {
			const Component = create({
				tag: `undefined-reserved-${key.toLowerCase()}`,
				url: "https://example.com",
				// @ts-expect-error JavaScript callers may leave an entry undefined.
				props: { [key]: undefined },
			});
			expect(() => Component()).not.toThrow();
		},
	);

	it.each(["json", "base64", "dotify"])(
		"rejects the removed serialization option set to %s before registering",
		(serialization) => {
			const tag = `removed-serialization-${serialization}`;
			expect(() =>
				create({
					tag,
					url: "https://example.com",
					props: {
						profile: {
							schema: prop.any<Record<string, unknown>>(),
							// @ts-expect-error removed options are unknown wrapped fields; a JavaScript caller may still pass serialization as undefined, which the runtime accepts
							serialization,
						},
					},
				}),
			).toThrow(
				forgeFrameError(
					"VALIDATION",
					'Prop "profile" uses the removed "serialization" option. ForgeFrame 2 always sends props as JSON; remove the option.',
				),
			);
			expect(() =>
				create({
					tag,
					url: "https://example.com",
					props: { profile: prop.any<Record<string, unknown>>() },
				}),
			).not.toThrow();
		},
	);

	it("accepts a serialization option set to undefined", () => {
		const Component = create({
			tag: "undefined-serialization",
			url: "https://example.com",
			props: {
				profile: {
					schema: prop.any<Record<string, unknown>>(),
					// @ts-expect-error removed options are unknown wrapped fields; a JavaScript caller may still pass serialization as undefined, which the runtime accepts
					serialization: undefined,
				},
			},
		});
		expect(() => Component({ profile: {} })).not.toThrow();
	});

	it.each([
		[
			"required",
			true,
			"A prop is required exactly when its schema rejects undefined; use the schema's .optional() to make it optional.",
		],
		[
			"default",
			"light",
			"Use the schema's .default(), or compute the value before passing it.",
		],
		[
			"value",
			() => "computed",
			"Use the schema's .default(), or compute the value before passing it.",
		],
		[
			"decorate",
			({ value }: { value: string }) => value.trim(),
			"Use a schema transform instead, such as prop.string().trim().",
		],
		[
			"hostDecorate",
			({ value }: { value: string }) => value,
			"Transform the value on the host after it is received.",
		],
		[
			"validate",
			() => {},
			"Use a schema refinement, or the component's validate({ props }) option for cross-prop rules.",
		],
		[
			"alias",
			"userTheme",
			"Rename the input to the prop's key before calling the factory.",
		],
		["sameDomain", true, "Use deliverTo: 'same-origin' instead."],
		[
			"trustedDomains",
			["https://a.example"],
			"Use deliverTo with an origin string, a RegExp, or an array of them instead.",
		],
	])(
		"rejects the removed %s prop option with its replacement before registering",
		(option, value, replacement) => {
			const tag = `removed-prop-option-${option.toLowerCase()}`;
			expect(() =>
				create({
					tag,
					url: "https://example.com",
					props: {
						// @ts-expect-error removed options are unknown wrapped fields; a JavaScript caller may still pass serialization as undefined, which the runtime accepts
						theme: { schema: prop.string(), [option]: value },
					},
				}),
			).toThrow(
				forgeFrameError(
					"VALIDATION",
					`Prop "theme" uses the removed "${option}" option. ${replacement}`,
				),
			);
			expect(getComponent(tag)).toBeUndefined();
		},
	);

	it("rejects malformed wrapped definitions before registering", () => {
		expect(() =>
			create({
				tag: "malformed-wrapped-definition",
				url: "https://example.com",
				props: {
					// @ts-expect-error A wrapped definition needs a schema.
					theme: { queryParam: true },
				},
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Prop "theme" needs a schema. Use prop.any() for a value that is deliberately unchecked.',
			),
		);
		// A blank origin is type-valid; only the runtime rejects it.
		expect(() =>
			create({
				tag: "malformed-wrapped-definition",
				url: "https://example.com",
				props: { theme: { schema: prop.string(), deliverTo: " " } },
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Prop "theme" deliverTo must be a non-empty origin string, a RegExp, or an array of them',
			),
		);
		const encodeTheme = (): string => "encoded";
		expect(() =>
			create({
				tag: "malformed-wrapped-definition",
				url: "https://example.com",
				props: {
					theme: {
						schema: prop.string(),
						// @ts-expect-error queryParam must be a boolean or a parameter name.
						queryParam: encodeTheme,
					},
				},
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Prop "theme" queryParam must be a boolean or a non-empty parameter name.',
			),
		);
		expect(getComponent("malformed-wrapped-definition")).toBeUndefined();
	});

	it("keeps its own copy of the options, so later caller changes are ignored", () => {
		const label = { schema: prop.string(), queryParam: "label" as string };
		const options = {
			tag: "copied-options",
			url: "https://example.com/widget",
			props: { label },
		};
		const Component = create(options);
		options.url = "https://attacker.example/widget";
		label.queryParam = "";
		(options.props as Record<string, unknown>).extra = { schema: 1 };
		const instance = Component({ label: "a" });
		expect(getComponentOptions(Component)).toMatchObject({
			url: "https://example.com/widget",
			props: { label: { queryParam: "label" } },
		});
		expect(getComponentOptions(Component)?.props).not.toHaveProperty("extra");
		void instance.close();
	});

	it("should reject props named then or children and accept host control names", () => {
		expect(() =>
			create({
				tag: "reserved-then-prop",
				url: "https://example.com",
				props: {
					// @ts-expect-error then is a reserved prop name
					// biome-ignore lint/suspicious/noThenProperty: checks the reserved name
					then: prop.function(),
				},
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Prop "then" is reserved by ForgeFrame and cannot be defined as a custom prop',
			),
		);
		expect(() =>
			create({
				tag: "control-named-props",
				url: "https://example.com",
				props: {
					close: prop.function(),
					resize: prop.string(),
					consumerOrigin: prop.string(),
				},
			}),
		).not.toThrow();

		expect(() =>
			create({
				tag: "reserved-children-prop",
				url: "https://example.com",
				props: {
					// @ts-expect-error children is a reserved prop name
					children: prop.any<Record<string, unknown>>(),
				},
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Prop "children" is reserved by ForgeFrame and cannot be defined as a custom prop',
			),
		);
	});

	it("should ignore undeclared inputs named like removed lifecycle callbacks", async () => {
		const callbacks = {
			onClose: vi.fn(),
			onDestroy: vi.fn(),
			onResize: vi.fn(),
			onFocus: vi.fn(),
			onError: vi.fn(),
			cspNonce: "nonce-value",
			timeout: 1,
		};
		const MyComponent = create({
			tag: "lifecycle-callback-values",
			url: "https://example.com/component",
		});

		const instance = MyComponent(callbacks as Record<string, unknown>);
		await instance.resize({ width: 1, height: 1 });
		await instance.close();

		expect(getConsumerInternals(instance).propsPipeline.props).toEqual({});
		for (const callback of Object.values(callbacks)) {
			if (typeof callback === "function")
				expect(callback).not.toHaveBeenCalled();
		}
	});

	it("should throw error for duplicate tag", () => {
		create({
			tag: "duplicate-tag",
			url: "https://example.com",
		});

		expect(() =>
			create({
				tag: "duplicate-tag",
				url: "https://example.com",
			}),
		).toThrow(forgeFrameError("VALIDATION", "already registered"));
	});

	it("should create an instance when called", () => {
		const MyComponent = create({
			tag: "test-instance",
			url: "https://example.com",
		});

		const instance = MyComponent({ customProp: "value" });

		expect(MyComponent.instances).toEqual([instance]);
		expect(typeof instance.render).toBe("function");
		expect(typeof instance.close).toBe("function");
		expect(typeof instance.updateProps).toBe("function");
		expect(instance.event).toBeDefined();
		expect(MyComponent.instances.length).toBe(1);
	});

	it("should support custom dimensions", () => {
		const MyComponent = create({
			tag: "sized-component",
			url: "https://example.com",
			dimensions: { width: 400, height: 300 },
		});
		const instance = MyComponent({});
		const resolvedDimensions =
			getConsumerInternals(instance).resolveDimensions();

		expect(resolvedDimensions).toEqual({ width: 400, height: 300 });
	});

	it("should support default context", () => {
		const PopupComponent = create({
			tag: "popup-component",
			url: "https://example.com",
			context: CONTEXT.POPUP,
		});
		const instance = PopupComponent({});

		expect(getConsumerInternals(instance).renderer.context).toBe(CONTEXT.POPUP);
	});

	it("should materialize function url options from the latest normalized props", async () => {
		const DynamicUrlComponent = create({
			tag: "dynamic-url-component",
			hostOrigins: "https://example.com",
			url: (props) => `https://example.com/${props.path}`,
			props: {
				path: { schema: prop.string() },
			},
		});
		const instance = DynamicUrlComponent({ path: "checkout" });
		const internal = getConsumerInternals(instance);

		expect(internal.propsPipeline.props.path).toBe("checkout");
		expect(internal.resolveUrl()).toBe("https://example.com/checkout");

		await instance.updateProps({ path: "billing" });

		expect(internal.propsPipeline.props.path).toBe("billing");
		expect(internal.resolveUrl()).toBe("https://example.com/billing");
	});

	it("should materialize function dimensions options from the latest normalized props", async () => {
		const DynamicDimensionsComponent = create({
			tag: "dynamic-dimensions-component",
			url: "https://example.com",
			props: {
				height: { schema: prop.number() },
			},
			dimensions: (props) => ({ width: "100%", height: props.height }),
		});
		const instance = DynamicDimensionsComponent({ height: 420 });
		const internal = getConsumerInternals(instance);

		expect(internal.propsPipeline.props.height).toBe(420);
		expect(internal.resolveDimensions()).toEqual({
			width: "100%",
			height: 420,
		});

		await instance.updateProps({ height: 560 });

		expect(internal.propsPipeline.props.height).toBe(560);
		expect(internal.resolveDimensions()).toEqual({
			width: "100%",
			height: 560,
		});
	});
});

describe("Component Instance", () => {
	it("adds a message listener only when an instance opens host content", async () => {
		const addEventListener = vi.spyOn(window, "addEventListener");
		const messageListenerCount = () =>
			addEventListener.mock.calls.filter(([type]) => type === "message").length;
		const Component = create({
			tag: "lazy-message-listener-component",
			url: "https://host.example.com/widget",
			initTimeout: 50,
		});

		const unrendered = Component();
		const instance = Component();
		expect(messageListenerCount()).toBe(0);

		const container = document.createElement("div");
		document.body.append(container);
		const rendering = instance.render(container).catch(() => undefined);
		await vi.waitFor(() => expect(messageListenerCount()).toBe(1));
		await rendering;
		await unrendered.close();
		container.remove();
	});

	afterEach(() => {
		clearComponents();
	});

	it("should validate schema inputs before invoking output-typed callbacks", () => {
		const resolveUrl = vi.fn(
			(props: { amount: number }) =>
				`https://example.com/amount/${props.amount.toFixed(0)}`,
		);
		const validate = vi.fn((_options: { props: { amount: number } }) => {});
		const CoercedComponent = create({
			tag: "coerced-callback-component",
			hostOrigins: "https://example.com",
			url: resolveUrl,
			props: { amount: { schema: z.coerce.number() } },
			validate,
		});

		const instance = CoercedComponent({ amount: "42" });

		expect(resolveUrl).not.toHaveBeenCalled();
		expect(() => checkRenderValidation(instance)).not.toThrow();
		expect(validate).toHaveBeenCalledWith({
			props: expect.objectContaining({ amount: 42 }),
		});
		expect(getConsumerInternals(instance).resolveUrl()).toBe(
			"https://example.com/amount/42",
		);
	});

	it("should preserve render-time errors for invalid schema inputs", async () => {
		const InvalidInputComponent = create({
			tag: "invalid-coerced-timing-component",
			url: "https://example.com/invalid-coerced",
			props: { amount: { schema: z.coerce.number() } },
		});

		let instance: ReturnType<typeof InvalidInputComponent> | undefined;
		expect(() => {
			instance = InvalidInputComponent({ amount: "not a number" });
		}).not.toThrow();

		await expect(
			instance?.render(document.createElement("div")),
		).rejects.toThrow(
			forgeFrameError("VALIDATION", "Validation failed: amount"),
		);
	});

	it("should retain deferred schema errors until a valid prop update", async () => {
		const DeferredFailureComponent = create({
			tag: "stable-deferred-normalization-error-component",
			url: "https://example.com/deferred-normalization-error",
			props: {
				targetUrl: z.string().url(),
				label: prop.string().default("fallback"),
			},
		});
		const instance = DeferredFailureComponent({ targetUrl: "not-a-url" });

		expect(() => checkRenderValidation(instance)).toThrow(
			forgeFrameError("VALIDATION", "Invalid URL"),
		);
		expect(() => checkRenderValidation(instance)).toThrow(
			forgeFrameError("VALIDATION", "Invalid URL"),
		);
		await expect(instance.updateProps({ label: "still" })).rejects.toThrow(
			forgeFrameError("VALIDATION", "Invalid URL"),
		);

		await expect(
			instance.updateProps({ targetUrl: "https://safe.example.com/widget" }),
		).resolves.toBeUndefined();
		expect(() => checkRenderValidation(instance)).not.toThrow();
		expect(getConsumerInternals(instance).propsPipeline.props).toMatchObject({
			targetUrl: "https://safe.example.com/widget",
			label: "fallback",
		});
	});

	it("should defer a throwing schema default to render", async () => {
		const failure = new Error("no default id");
		const factory = vi.fn((): string => {
			throw failure;
		});
		const ThrowingDefaultComponent = create({
			tag: "throwing-default-factory-component",
			url: "https://example.com/throwing-default",
			props: { id: prop.string().default(factory) },
		});

		const instance = ThrowingDefaultComponent();

		expect(() => checkRenderValidation(instance)).toThrow(failure);
		await expect(
			instance.updateProps({ id: "supplied" }),
		).resolves.toBeUndefined();
		expect(() => checkRenderValidation(instance)).not.toThrow();
	});

	it("should recover deferred normalization after a valid prop update", async () => {
		const RecoverableComponent = create({
			tag: "recoverable-invalid-input-component",
			url: "https://example.com/recoverable-invalid-input",
			props: {
				amount: { schema: z.coerce.number() },
				label: prop.string().default("7"),
			},
		});
		const instance = RecoverableComponent({ amount: "not a number" });

		await expect(
			instance.updateProps({ amount: "7" }),
		).resolves.toBeUndefined();
		expect(() => checkRenderValidation(instance)).not.toThrow();
		expect(getConsumerInternals(instance).propsPipeline.props).toMatchObject({
			amount: 7,
			label: "7",
		});
	});

	it("should normalize direct schema defaults exactly once before callbacks", () => {
		const validate = vi.fn((_options: { props: { amount: number } }) => {});
		const DefaultedCoercedComponent = create({
			tag: "defaulted-coerced-callback-component",
			url: "https://example.com/defaulted-coerced",
			props: { amount: { schema: z.coerce.number().default(42) } },
			validate,
		});

		const instance = DefaultedCoercedComponent({});

		expect(() => checkRenderValidation(instance)).not.toThrow();
		expect(validate).toHaveBeenCalledWith({
			props: expect.objectContaining({ amount: 42 }),
		});
	});

	it("should revalidate retained mutable schema inputs before rendering", async () => {
		const safeOrigin = "https://safe.example.com";
		const target = new URL(`${safeOrigin}/component`);
		const MutableUrlComponent = create({
			tag: "mutable-url-schema-component",
			url: (props) => props.target.href,
			hostOrigins: safeOrigin,
			props: {
				target: z
					.instanceof(URL)
					.refine((value) => value.origin === safeOrigin, "Unsafe URL origin"),
			},
		});
		const instance = MutableUrlComponent({ target });

		expect(() => checkRenderValidation(instance)).not.toThrow();
		target.href = "https://attacker.example.com/component";

		await expect(
			instance.render(document.createElement("div")),
		).rejects.toThrow(forgeFrameError("VALIDATION", "Unsafe URL origin"));
	});

	it("should recheck time-varying schema policies at trust boundaries", () => {
		const allowedOrigins = new Set(["https://safe.example.com"]);
		const PolicyComponent = create({
			tag: "time-varying-schema-policy-component",
			hostOrigins: "https://safe.example.com",
			url: (props) => props.targetUrl,
			props: {
				targetUrl: z
					.string()
					.refine(
						(value) => allowedOrigins.has(new URL(value).origin),
						"URL origin is no longer allowed",
					),
			},
		});
		const instance = PolicyComponent({
			targetUrl: "https://safe.example.com/component",
		});

		expect(() => checkRenderValidation(instance)).not.toThrow();
		allowedOrigins.clear();

		expect(() => checkRenderValidation(instance)).toThrow(
			forgeFrameError("VALIDATION", "URL origin is no longer allowed"),
		);
	});

	it("should recheck mutable output-compatible defaults", () => {
		const safeOrigin = "https://safe.example.com";
		const sharedDefault = { href: `${safeOrigin}/component` };
		const DefaultPolicyComponent = create({
			tag: "mutable-default-policy-component",
			hostOrigins: safeOrigin,
			url: (props) => props.target.href,
			props: {
				target: {
					schema: z
						.object({
							href: z
								.string()
								.refine(
									(value) => new URL(value).origin === safeOrigin,
									"Unsafe default target",
								),
						})
						.default(sharedDefault),
				},
			},
		});
		const instance = DefaultPolicyComponent({});
		const normalizedDefault = getConsumerInternals(instance).propsPipeline.props
			.target as { href: string };
		normalizedDefault.href = "https://attacker.example.com/component";

		expect(() => checkRenderValidation(instance)).toThrow(
			forgeFrameError("VALIDATION", "Unsafe default target"),
		);
	});

	it("should recheck mutable normalized values", async () => {
		const safeOrigin = "https://safe.example.com";
		const PolicyComponent = create({
			tag: "mutable-normalized-policy-component",
			hostOrigins: safeOrigin,
			url: (props) => props.target.href,
			props: {
				target: z.object({
					href: z
						.string()
						.refine(
							(value) => new URL(value).origin === safeOrigin,
							"Unsafe normalized target",
						),
				}),
				label: z.string().optional(),
			},
		});
		const normalizedTarget = (instance: ReturnType<typeof PolicyComponent>) =>
			getConsumerInternals(instance).propsPipeline.props.target as {
				href: string;
				elevated?: boolean;
			};

		const renderInstance = PolicyComponent({
			target: { href: `${safeOrigin}/eligible` },
		});
		expect(() => checkRenderValidation(renderInstance)).not.toThrow();
		normalizedTarget(renderInstance).href =
			"https://attacker.example.com/eligible";
		expect(() => checkRenderValidation(renderInstance)).toThrow(
			forgeFrameError("VALIDATION", "Unsafe normalized target"),
		);

		const updateInstance = PolicyComponent({
			target: { href: `${safeOrigin}/update` },
		});
		normalizedTarget(updateInstance).href =
			"https://attacker.example.com/update";
		await expect(
			updateInstance.updateProps({ label: "updated" }),
		).rejects.toThrow(
			forgeFrameError("VALIDATION", "Unsafe normalized target"),
		);

		const strippedFieldInstance = PolicyComponent({
			target: { href: `${safeOrigin}/stripped-field` },
		});
		normalizedTarget(strippedFieldInstance).elevated = true;
		expect(() => checkRenderValidation(strippedFieldInstance)).toThrow(
			forgeFrameError(
				"VALIDATION",
				"value no longer matches its normalized schema output",
			),
		);
	});

	it("should recheck normalized values mutated during render callbacks", async () => {
		const safeOrigin = "https://safe.example.com";
		const RenderComponent = create({
			tag: "render-mutated-normalized-policy-component",
			hostOrigins: safeOrigin,
			url: (props) => props.target.href,
			props: {
				target: z.object({
					href: z
						.string()
						.refine(
							(value) => new URL(value).origin === safeOrigin,
							"Unsafe normalized render target",
						),
				}),
			},
		});
		const instance = RenderComponent({
			target: { href: `${safeOrigin}/render` },
		});
		const container = document.createElement("div");
		document.body.appendChild(container);

		instance.event.once(EVENT.RENDER, () => {
			(
				getConsumerInternals(instance).propsPipeline.props.target as {
					href: string;
				}
			).href = "https://attacker.example.com/render";
		});

		await expect(instance.render(container)).rejects.toThrow(
			forgeFrameError("VALIDATION", "Unsafe normalized render target"),
		);
		expect(container.querySelectorAll("iframe")).toHaveLength(0);
		container.remove();
	});

	it("should call component validate on render and updateProps", async () => {
		const validate = vi.fn();
		const MyComponent = create({
			tag: "validate-option-component",
			url: "https://example.com",
			props: {
				amount: { schema: prop.number() },
			},
			validate,
		});

		const instance = MyComponent({ amount: 10 });
		const container = document.createElement("div");
		document.body.appendChild(container);

		const instanceInternal = getConsumerInternals(instance);

		vi.spyOn(instanceInternal, "prerender").mockResolvedValue(undefined);
		vi.spyOn(instanceInternal, "open").mockResolvedValue(undefined);
		vi.spyOn(instanceInternal, "waitForHost").mockResolvedValue(undefined);

		await instance.render(container);
		await instance.updateProps({ amount: 20 });

		expect(validate).toHaveBeenCalledTimes(2);
		expect(validate).toHaveBeenNthCalledWith(1, {
			props: expect.objectContaining({ amount: 10 }),
		});
		expect(validate).toHaveBeenNthCalledWith(2, {
			props: expect.objectContaining({ amount: 20 }),
		});

		container.remove();
	});

	it("should open the updated url origin when props change before the first render", async () => {
		const DynamicUrlComponent = create({
			tag: "dynamic-origin-trust-component",
			hostOrigins: [
				"https://origin-a.example.com",
				"https://origin-b.example.com",
			],
			url: (props) => props.targetUrl,
			props: {
				targetUrl: { schema: prop.string() },
			},
		});

		const instance = DynamicUrlComponent({
			targetUrl: "https://origin-a.example.com/widget",
		});

		await instance.updateProps({
			targetUrl: "https://origin-b.example.com/widget",
		});

		const container = document.createElement("div");
		document.body.appendChild(container);

		const instanceInternal = getConsumerInternals(instance);

		vi.spyOn(instanceInternal, "waitForHost").mockResolvedValue(undefined);
		await instance.render(container);

		expect(container.querySelector("iframe")?.src).toBe(
			"https://origin-b.example.com/widget",
		);

		await instance.close();
		container.remove();
	});

	it("should resolve a dynamic host URL once and reuse it for the complete render", async () => {
		const firstOrigin = "https://origin-a.example.com";
		const secondOrigin = "https://origin-b.example.com";
		const resolveDynamicUrl = vi.fn(() => `${firstOrigin}/widget`);
		const DynamicUrlComponent = create({
			tag: "dynamic-url-render-snapshot-component",
			url: resolveDynamicUrl,
			hostOrigins: [firstOrigin, secondOrigin],
		});
		const instance = DynamicUrlComponent({});
		const container = document.createElement("div");
		document.body.appendChild(container);
		const instanceInternal = getConsumerInternals(instance);

		resolveDynamicUrl.mockClear();
		resolveDynamicUrl
			.mockReturnValueOnce(`${firstOrigin}/widget`)
			.mockReturnValue(`${secondOrigin}/widget`);
		vi.spyOn(instanceInternal, "waitForHost").mockResolvedValue(undefined);

		await instance.render(container);

		expect(resolveDynamicUrl).toHaveBeenCalledTimes(1);
		expect(container.querySelector("iframe")?.src).toBe(
			`${firstOrigin}/widget`,
		);

		await instance.close();
		container.remove();
	});

	it("should apply idle updateProps synchronously before awaiting", async () => {
		const DynamicUrlComponent = create({
			tag: "dynamic-origin-sync-update-component",
			hostOrigins: [
				"https://origin-a.example.com",
				"https://origin-b.example.com",
			],
			url: (props) => props.targetUrl,
			props: {
				targetUrl: { schema: prop.string() },
			},
		});

		const instance = DynamicUrlComponent({
			targetUrl: "https://origin-a.example.com/widget",
		});

		const pendingUpdate = instance.updateProps({
			targetUrl: "https://origin-b.example.com/widget",
		});

		const resolvedUrlAfterUpdateCall =
			getConsumerInternals(instance).resolveUrl();

		expect(resolvedUrlAfterUpdateCall).toBe(
			"https://origin-b.example.com/widget",
		);
		await pendingUpdate;
	});

	it("should reject url origin changes after render", async () => {
		const DynamicUrlComponent = create({
			tag: "dynamic-origin-after-render-component",
			hostOrigins: [
				"https://origin-a.example.com",
				"https://origin-b.example.com",
			],
			url: (props) => props.targetUrl,
			props: {
				targetUrl: { schema: prop.string() },
			},
		});

		const instance = DynamicUrlComponent({
			targetUrl: "https://origin-a.example.com/widget",
		});

		const container = document.createElement("div");
		document.body.appendChild(container);

		const instanceInternal = getConsumerInternals(instance);

		vi.spyOn(instanceInternal, "waitForHost").mockResolvedValue(undefined);
		await instance.render(container);

		await expect(
			instance.updateProps({
				targetUrl: "https://origin-b.example.com/widget",
			}),
		).rejects.toThrow(
			forgeFrameError(
				"ORIGIN_REJECTED",
				"Cannot change component URL origin after render",
			),
		);

		instanceInternal.transport.hostWindow = null;
		await expect(instance.updateProps({})).resolves.toBeUndefined();

		const resolvedUrlAfterFailedUpdate = instanceInternal.resolveUrl();
		expect(resolvedUrlAfterFailedUpdate).toBe(
			"https://origin-a.example.com/widget",
		);

		await instance.close();
		container.remove();
	});
});

describe("Component Registry", () => {
	afterEach(() => {
		clearComponents();
	});

	describe("getComponent", () => {
		it("should retrieve a registered component by tag", () => {
			const MyComponent = create({
				tag: "retrievable-component",
				url: "https://example.com",
			});

			const retrieved = getComponent("retrievable-component");

			expect(retrieved).toBe(MyComponent);
		});

		it("should return undefined for non-existent tag", () => {
			const retrieved = getComponent("non-existent");

			expect(retrieved).toBeUndefined();
		});

		it("should return a component with typed props", () => {
			const TypedComponent = create({
				tag: "typed-component",
				url: "https://example.com",
				props: {
					name: prop.string(),
				},
			});

			expect(getComponent("typed-component")).toBe(TypedComponent);
		});
	});

	describe("unregisterComponent", () => {
		it("should remove a component from the registry", () => {
			const ToUnregister = create({
				tag: "to-unregister",
				url: "https://example.com",
			});

			expect(getComponent("to-unregister")).toBe(ToUnregister);

			unregisterComponent("to-unregister");

			expect(getComponent("to-unregister")).toBeUndefined();
		});

		it("should not throw when unregistering non-existent component", () => {
			expect(() => unregisterComponent("does-not-exist")).not.toThrow();
		});

		it("should allow re-registering a component after unregistration", () => {
			create({
				tag: "re-register-test",
				url: "https://example.com/first",
			});

			unregisterComponent("re-register-test");

			// Should not throw - can register again
			const NewComponent = create({
				tag: "re-register-test",
				url: "https://example.com/second",
			});

			expect(getComponent("re-register-test")).toBe(NewComponent);
		});
	});
});

describe("Component Destruction", () => {
	afterEach(async () => {
		await closeAll();
		clearComponents();
	});

	describe("close", () => {
		it("should emit close event when calling close", async () => {
			const MyComponent = create({
				tag: "destroy-event-test",
				url: "https://example.com",
			});

			const instance = MyComponent({});
			const closeHandler = vi.fn();
			instance.event.on("close", closeHandler);

			await instance.close();

			expect(closeHandler).toHaveBeenCalled();
		});

		it("should remove instance from instances array when close is called", async () => {
			const MyComponent = create({
				tag: "destroy-removal-close-test",
				url: "https://example.com",
			});

			const instance = MyComponent({});
			expect(MyComponent.instances.length).toBe(1);

			await instance.close();

			expect(MyComponent.instances.length).toBe(0);
		});
	});
});

describe("Host Context Detection", () => {
	afterEach(() => {
		clearHostInstance();
		clearComponents();
		vi.restoreAllMocks();
		window.name = originalWindowName;
	});

	describe("isHost", () => {
		it("should return false when not in a ForgeFrame host window", () => {
			// In normal test environment, we're not in a host window
			expect(isHost()).toBe(false);
		});
	});

	describe("Component peer discovery", () => {
		it("should include all registered component tags when allTags is true", async () => {
			const AlphaComponent = create({
				tag: "peer-alpha",
				peers: "same-origin",
				url: "https://example.com/alpha",
			});
			const BetaComponent = create({
				tag: "peer-beta",
				peers: "same-origin",
				url: "https://example.com/beta",
			});

			const alphaPrimary = AlphaComponent({});
			const alphaSibling = AlphaComponent({});
			const betaSibling = BetaComponent({});
			setVerifiedHostOrigin(
				PEER_HOST_ORIGIN,
				alphaPrimary,
				alphaSibling,
				betaSibling,
			);

			const sameTagSiblings = getPeerInstances({
				uid: alphaPrimary.uid,
				tag: "peer-alpha",
				peers: "same-origin",
				hostOrigin: PEER_HOST_ORIGIN,
				allTags: false,
			});
			const allTagsSiblings = getPeerInstances({
				uid: alphaPrimary.uid,
				tag: "peer-alpha",
				peers: "same-origin",
				hostOrigin: PEER_HOST_ORIGIN,
				allTags: true,
			});

			expect(sameTagSiblings).toEqual([
				expect.objectContaining({
					uid: alphaSibling.uid,
					tag: "peer-alpha",
				}),
			]);
			expect(allTagsSiblings).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						uid: alphaSibling.uid,
						tag: "peer-alpha",
					}),
					expect.objectContaining({
						uid: betaSibling.uid,
						tag: "peer-beta",
					}),
				]),
			);
			expect(
				allTagsSiblings.some((sibling) => sibling.uid === alphaPrimary.uid),
			).toBe(false);

			await Promise.all([
				alphaPrimary.close(),
				alphaSibling.close(),
				betaSibling.close(),
			]);
		});

		it("should exclude peers whose verified host origin differs or is unavailable", async () => {
			const AlphaComponent = create({
				tag: "peer-origin-alpha",
				peers: "same-origin",
				url: "https://example.com/alpha",
			});
			const BetaComponent = create({
				tag: "peer-origin-beta",
				peers: "same-origin",
				url: "https://example.com/beta",
			});

			const requester = AlphaComponent({});
			const sameOrigin = AlphaComponent({});
			const foreignSameTag = AlphaComponent({});
			const foreignOtherTag = BetaComponent({});
			const unconnected = AlphaComponent({});
			const sameOriginOtherTag = BetaComponent({});
			(foreignSameTag as { exports?: unknown }).exports = {
				secret: "foreign-same-tag",
			};
			(foreignOtherTag as { exports?: unknown }).exports = {
				secret: "foreign-other-tag",
			};
			setVerifiedHostOrigin(
				PEER_HOST_ORIGIN,
				requester,
				sameOrigin,
				sameOriginOtherTag,
			);
			setVerifiedHostOrigin(
				"https://foreign-host.example.com",
				foreignSameTag,
				foreignOtherTag,
			);

			for (const allTags of [false, true]) {
				const uids = getPeerInstances({
					uid: requester.uid,
					tag: "peer-origin-alpha",
					peers: "same-origin",
					hostOrigin: PEER_HOST_ORIGIN,
					allTags,
				}).map((sibling) => sibling.uid);

				expect(uids).toContain(sameOrigin.uid);
				expect(uids).not.toContain(foreignSameTag.uid);
				expect(uids).not.toContain(foreignOtherTag.uid);
				expect(uids).not.toContain(unconnected.uid);
				expect(uids.includes(sameOriginOtherTag.uid)).toBe(allTags);
			}

			await Promise.all(
				[
					requester,
					sameOrigin,
					foreignSameTag,
					foreignOtherTag,
					unconnected,
					sameOriginOtherTag,
				].map((instance) => instance.close()),
			);
		});

		it("should let a component admit other host origins through peers", async () => {
			const SharedComponent = create({
				tag: "peer-domains-shared",
				url: "https://widgets-a.myapp.example/widget",
				hostOrigins: "https://*.myapp.example",
				peers: "https://*.myapp.example",
			});
			const PrivateComponent = create({
				tag: "peer-domains-private",
				peers: "same-origin",
				url: "https://widgets-a.myapp.example/private",
				hostOrigins: "https://*.myapp.example",
			});

			const requester = SharedComponent({});
			const sharedPeer = SharedComponent({});
			const privatePeer = PrivateComponent({});
			setVerifiedHostOrigin("https://widgets-a.myapp.example", requester);
			setVerifiedHostOrigin(
				"https://widgets-b.myapp.example",
				sharedPeer,
				privatePeer,
			);
			const lookup = (hostOrigin: string) =>
				getPeerInstances({
					uid: requester.uid,
					tag: "peer-domains-shared",
					peers: "same-origin",
					hostOrigin,
					allTags: true,
				}).map((sibling) => sibling.uid);

			expect(lookup("https://widgets-a.myapp.example")).toEqual([
				sharedPeer.uid,
			]);
			expect(lookup("https://evil.example.com")).toEqual([]);
			expect(lookup("null")).toEqual([]);

			await Promise.all(
				[requester, sharedPeer, privatePeer].map((instance) =>
					instance.close(),
				),
			);
		});

		it("never lists a peer whose own host is opaque, even when its peers matcher admits the requester", async () => {
			const PartnerComponent = create({
				tag: "peer-domains-opaque-peer",
				url: "https://widgets.myapp.example/widget",
				peers: "https://*.myapp.example",
			});
			const requester = PartnerComponent({});
			const opaquePeer = PartnerComponent({});
			const namedPeer = PartnerComponent({});
			(opaquePeer as { exports?: unknown }).exports = {
				secret: "sandboxed document",
			};
			setVerifiedHostOrigin("https://widgets.myapp.example", requester);
			setVerifiedHostOrigin("null", opaquePeer);
			setVerifiedHostOrigin("https://other.myapp.example", namedPeer);

			expect(
				getPeerInstances({
					uid: requester.uid,
					tag: "peer-domains-opaque-peer",
					peers: "same-origin",
					hostOrigin: "https://widgets.myapp.example",
					allTags: false,
				}).map((sibling) => sibling.uid),
			).toEqual([namedPeer.uid]);

			await Promise.all(
				[requester, opaquePeer, namedPeer].map((instance) => instance.close()),
			);
		});

		it("should list same-origin peers whose hosts are still loading without exports", async () => {
			const LoadingComponent = create({
				tag: "peer-loading",
				peers: "same-origin",
				url: "https://example.com/loading",
			});

			const requester = LoadingComponent({});
			const loadingPeer = LoadingComponent({});
			const foreignLoadingPeer = LoadingComponent({});
			(loadingPeer as { exports?: unknown }).exports = {
				early: "not yet verified",
			};
			setVerifiedHostOrigin(PEER_HOST_ORIGIN, requester);
			setOpenedHostOrigin(PEER_HOST_ORIGIN, loadingPeer);
			setOpenedHostOrigin(
				"https://foreign-host.example.com",
				foreignLoadingPeer,
			);

			expect(
				getPeerInstances({
					uid: requester.uid,
					tag: "peer-loading",
					peers: "same-origin",
					hostOrigin: PEER_HOST_ORIGIN,
					allTags: false,
				}),
			).toEqual([
				{ uid: loadingPeer.uid, tag: "peer-loading", exports: undefined },
			]);

			setVerifiedHostOrigin(PEER_HOST_ORIGIN, loadingPeer);
			expect(
				getPeerInstances({
					uid: requester.uid,
					tag: "peer-loading",
					peers: "same-origin",
					hostOrigin: PEER_HOST_ORIGIN,
					allTags: false,
				}),
			).toEqual([
				{
					uid: loadingPeer.uid,
					tag: "peer-loading",
					exports: { early: "not yet verified" },
				},
			]);

			await Promise.all(
				[requester, loadingPeer, foreignLoadingPeer].map((instance) =>
					instance.close(),
				),
			);
		});

		it("should update indexed peers when sibling instances are destroyed", async () => {
			const IndexedComponent = create({
				tag: "peer-index-cleanup",
				peers: "same-origin",
				url: "https://example.com/peer-index-cleanup",
			});

			const primary = IndexedComponent({});
			const sibling = IndexedComponent({});
			setVerifiedHostOrigin(PEER_HOST_ORIGIN, primary, sibling);

			expect(
				getPeerInstances({
					uid: primary.uid,
					tag: "peer-index-cleanup",
					peers: "same-origin",
					hostOrigin: PEER_HOST_ORIGIN,
					allTags: false,
				}),
			).toEqual([
				expect.objectContaining({
					uid: sibling.uid,
					tag: "peer-index-cleanup",
				}),
			]);

			await sibling.close();

			expect(
				getPeerInstances({
					uid: primary.uid,
					tag: "peer-index-cleanup",
					peers: "same-origin",
					hostOrigin: PEER_HOST_ORIGIN,
					allTags: false,
				}),
			).toEqual([]);

			await primary.close();
		});

		it("should exclude unregistered tags from allTags sibling lookup", async () => {
			const AlphaComponent = create({
				tag: "peer-index-unregister-alpha",
				peers: "same-origin",
				url: "https://example.com/peer-index-unregister-alpha",
			});
			const BetaComponent = create({
				tag: "peer-index-unregister-beta",
				peers: "same-origin",
				url: "https://example.com/peer-index-unregister-beta",
			});

			const alphaPrimary = AlphaComponent({});
			const betaSibling = BetaComponent({});
			setVerifiedHostOrigin(PEER_HOST_ORIGIN, alphaPrimary, betaSibling);

			const siblingsBeforeUnregister = getPeerInstances({
				uid: alphaPrimary.uid,
				tag: "peer-index-unregister-alpha",
				peers: "same-origin",
				hostOrigin: PEER_HOST_ORIGIN,
				allTags: true,
			});
			expect(
				siblingsBeforeUnregister.some(
					(sibling) => sibling.uid === betaSibling.uid,
				),
			).toBe(true);

			unregisterComponent("peer-index-unregister-beta");

			const siblingsAfterUnregister = getPeerInstances({
				uid: alphaPrimary.uid,
				tag: "peer-index-unregister-alpha",
				peers: "same-origin",
				hostOrigin: PEER_HOST_ORIGIN,
				allTags: true,
			});
			expect(
				siblingsAfterUnregister.some(
					(sibling) => sibling.uid === betaSibling.uid,
				),
			).toBe(false);

			await Promise.all([alphaPrimary.close(), betaSibling.close()]);
		});
	});
});
