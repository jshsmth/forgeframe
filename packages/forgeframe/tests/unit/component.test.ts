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
import { getSiblingInstances } from "@/core/consumer/siblings";
import { clearHostInstance, isHost } from "@/core/host";
import { prop } from "@/props/prop";
import type { ComponentOptions } from "@/types";
import {
	PEER_HOST_DOMAIN,
	setOpenedHostDomain,
	setVerifiedHostDomain,
} from "../peer-host-domain";
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

describe("Component Creation", () => {
	it.each([
		{ url: 123 },
		{ url: {} },
		{ tag: ["valid-tag"] },
		{ defaultContext: "unsupported" },
		{ timeout: Infinity },
		{ timeout: NaN },
		{ timeout: -1 },
		{ timeout: "1000" },
		{ timeout: 2147483648 },
	])(
		"rejects invalid JavaScript configuration before registration: %j",
		(patch) => {
			const options = {
				tag: "invalid-runtime-options",
				url: "https://example.com",
				...patch,
			};
			expect(() =>
				create(options as unknown as ComponentOptions<Record<string, unknown>>),
			).toThrow();
			expect(getComponent("invalid-runtime-options")).toBeUndefined();
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
				"unsupported" as unknown as typeof CONTEXT.IFRAME,
			),
		).rejects.toThrow("Render context");
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

		expect(MyComponent).toBeDefined();
		expect(typeof MyComponent).toBe("function");
		expect(MyComponent.instances).toEqual([]);
	});

	it("should allow relative string urls in browser environments", () => {
		const MyComponent = create({
			tag: "relative-url-component",
			url: "/component.html",
		});

		expect(MyComponent).toBeDefined();
	});

	it.each([
		"javascript:alert(1)",
		"data:text/html,unsafe",
		"blob:https://example.com/id",
	])("should reject unsupported host URL %s", (url) => {
		expect(() =>
			create({ tag: `unsafe-url-${url.split(":")[0]}`, url }),
		).toThrow("Only http: and https: are supported");
	});

	it("should enforce domain as a host URL allowlist", () => {
		expect(() =>
			create({
				tag: "domain-policy-component",
				url: "https://attacker.example.com/widget",
				domain: "https://trusted.example.com",
			}),
		).toThrow("is not allowed by the configured domain policy");
	});

	it("should validate function URLs before rendering them", async () => {
		const DynamicComponent = create({
			tag: "dynamic-unsafe-url-component",
			url: () => "javascript:alert(1)",
		});
		const instance = DynamicComponent({});

		await expect(
			instance.render(document.createElement("div")),
		).rejects.toThrow("Only http: and https: are supported");
		expect(DynamicComponent.instances).toEqual([]);
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
			"Validation failed: email: Required",
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
		).toThrow("Invalid component tag");
	});

	it("should throw error for missing tag", () => {
		expect(() =>
			create({
				tag: "",
				url: "https://example.com",
			}),
		).toThrow("Component tag is required");
	});

	it("should throw error for missing url", () => {
		expect(() =>
			create({
				tag: "my-component",
				url: "",
			}),
		).toThrow("Component url is required");
	});

	it.each([
		{ option: "domain", value: "" },
		{ option: "domain", value: " " },
		{ option: "peerDomains", value: ["https://partner.example.com", ""] },
		{ option: "peerDomains", value: null },
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
				`Component ${option} must be a non-empty origin string, a RegExp, or an array of them`,
			);
		},
	);

	it("accepts an empty allowlist array as a policy that admits no origin", () => {
		expect(() =>
			create({
				tag: "empty-domain-matcher-component",
				url: "https://host.example.com/widget",
				peerDomains: [],
			}),
		).not.toThrow();
	});

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
				'Component option "allowedConsumerDomains" was removed. Pass the allowlist to the host instead: initHost(Component, { consumerOrigins }).',
			);
			expect(getComponent("removed-allowlist-component")).toBeUndefined();
		},
	);

	it.each(["onError", "close", "children"])(
		"omits an undefined reserved definition for %s during declaration",
		(key) => {
			const Component = create<Record<string, unknown>>({
				tag: `undefined-reserved-${key.toLowerCase()}`,
				url: "https://example.com",
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
							serialization,
						},
					},
				}),
			).toThrow(
				'Prop "profile" uses the removed "serialization" option. ForgeFrame 2 always sends props as JSON; remove the option.',
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
						theme: { schema: prop.string(), [option]: value } as never,
					},
				}),
			).toThrow(
				`Prop "theme" uses the removed "${option}" option. ${replacement}`,
			);
			expect(getComponent(tag)).toBeUndefined();
		},
	);

	it("rejects malformed wrapped definitions before registering", () => {
		const define = (theme: unknown) => () =>
			create({
				tag: "malformed-wrapped-definition",
				url: "https://example.com",
				props: { theme: theme as never },
			});

		expect(define({ queryParam: true })).toThrow(
			'Prop "theme" needs a schema. Use prop.any() for a value that is deliberately unchecked.',
		);
		expect(define({ schema: prop.string(), deliverTo: " " })).toThrow(
			'Prop "theme" deliverTo must be a non-empty origin string, a RegExp, or an array of them',
		);
		expect(
			define({ schema: prop.string(), queryParam: () => "encoded" }),
		).toThrow(
			'Prop "theme" queryParam must be a boolean or a non-empty parameter name.',
		);
		expect(getComponent("malformed-wrapped-definition")).toBeUndefined();
	});

	it("should reject custom props that collide with hostProps built-ins", () => {
		expect(() =>
			create({
				tag: "reserved-close-prop",
				url: "https://example.com",
				props: {
					close: prop.function(),
				},
			}),
		).toThrow(
			'Prop "close" is reserved by hostProps built-ins and cannot be defined as a custom prop',
		);

		expect(() =>
			create({
				tag: "reserved-children-prop",
				url: "https://example.com",
				props: {
					children: prop.any<Record<string, unknown>>(),
				},
			}),
		).toThrow(
			'Prop "children" is reserved by hostProps built-ins and cannot be defined as a custom prop',
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
		).toThrow("already registered");
	});

	it("should create an instance when called", () => {
		const MyComponent = create({
			tag: "test-instance",
			url: "https://example.com",
		});

		const instance = MyComponent({ customProp: "value" });

		expect(instance).toBeDefined();
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
		const resolvedDimensions = (
			instance as unknown as {
				resolveDimensions: () => { width: number; height: number };
			}
		).resolveDimensions();

		expect(MyComponent).toBeDefined();
		expect(resolvedDimensions).toEqual({ width: 400, height: 300 });
	});

	it("should support default context", () => {
		const PopupComponent = create({
			tag: "popup-component",
			url: "https://example.com",
			defaultContext: CONTEXT.POPUP,
		});
		const instance = PopupComponent({});

		expect(PopupComponent).toBeDefined();
		expect(getConsumerInternals(instance).renderer.context).toBe(CONTEXT.POPUP);
	});

	it("should materialize function url options from the latest normalized props", async () => {
		const DynamicUrlComponent = create<{ path: string }>({
			tag: "dynamic-url-component",
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
		const DynamicDimensionsComponent = create<{ height: number }>({
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
			timeout: 50,
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
		const TransformedComponent = create({
			tag: "transformed-callback-component",
			url: resolveUrl,
			props: {
				amount: {
					schema: z.string().transform(Number),
					outputSchema: z.number(),
				},
			},
			validate,
		});

		const instance = TransformedComponent({ amount: "42" });

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
		const InvalidTransformComponent = create({
			tag: "invalid-transform-timing-component",
			url: "https://example.com/invalid-transform",
			props: {
				amount: {
					schema: z.string().transform(Number),
					outputSchema: z.number(),
				},
			},
		});

		let instance: ReturnType<typeof InvalidTransformComponent> | undefined;
		expect(() => {
			instance = InvalidTransformComponent({
				amount: 42 as unknown as string,
			});
		}).not.toThrow();

		await expect(
			instance?.render(document.createElement("div")),
		).rejects.toThrow();
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

		expect(() => checkRenderValidation(instance)).toThrow("Invalid URL");
		expect(() => checkRenderValidation(instance)).toThrow("Invalid URL");
		await expect(instance.updateProps({ label: "still" })).rejects.toThrow(
			"Invalid URL",
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
				amount: {
					schema: z.string().transform(Number),
					outputSchema: z.number(),
				},
				label: prop.string().default("7"),
			},
		});
		const instance = RecoverableComponent({
			amount: 42 as unknown as string,
		});

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
		const DefaultedTransformComponent = create({
			tag: "defaulted-transform-callback-component",
			url: "https://example.com/defaulted-transform",
			props: {
				amount: {
					schema: z.string().transform(Number).default(42),
					outputSchema: z.number(),
				},
			},
			validate,
		});

		const instance = DefaultedTransformComponent({});

		expect(() => checkRenderValidation(instance)).not.toThrow();
		expect(validate).toHaveBeenCalledWith({
			props: expect.objectContaining({ amount: 42 }),
		});
	});

	it("should require output validation for consumer-only transformed props", () => {
		const ConsumerOnlyTransformComponent = create<
			{ amount: number },
			unknown,
			{ amount: string }
		>({
			tag: "consumer-only-transform-component",
			url: "https://example.com/consumer-only-transform",
			props: {
				amount: {
					schema: z.string().transform(Number),
					sendToHost: false,
				} as never,
			},
		});

		const instance = ConsumerOnlyTransformComponent({ amount: "42" });

		expect(() => checkRenderValidation(instance)).toThrow();
	});

	it("should revalidate mutable consumer-only transform outputs before URL use", async () => {
		const safeOrigin = "https://safe.example.com";
		const resolveUrl = vi.fn(
			(props: { target: { href: string }; label?: string }) =>
				props.target.href,
		);
		const ConsumerOnlyTargetComponent = create<
			{ target: { href: string }; label?: string },
			unknown,
			{ target: string; label?: string }
		>({
			tag: "consumer-only-mutable-transform-component",
			url: resolveUrl,
			props: {
				target: {
					schema: z.string().transform((href) => ({ href })),
					outputSchema: z.object({
						href: z
							.string()
							.refine(
								(href) => new URL(href).origin === safeOrigin,
								"Unsafe consumer-only target",
							),
					}),
					sendToHost: false,
				},
				label: z.string().optional(),
			},
		});
		const instance = ConsumerOnlyTargetComponent({
			target: `${safeOrigin}/widget`,
		});

		expect(() => checkRenderValidation(instance)).not.toThrow();
		resolveUrl.mockClear();
		(
			getConsumerInternals(instance).propsPipeline.props.target as {
				href: string;
			}
		).href = "https://attacker.example.com/widget";

		await expect(instance.updateProps({ label: "updated" })).rejects.toThrow(
			"Unsafe consumer-only target",
		);
		expect(resolveUrl).not.toHaveBeenCalled();
	});

	it("should not feed transformed outputs back through their input schema on updates", async () => {
		const TransformComponent = create({
			tag: "stable-transformed-update-component",
			url: "https://example.com/transformed-update",
			props: {
				amount: {
					schema: z.string().transform((value) => `${value}!`),
					outputSchema: z.string(),
				},
				label: z.string().optional(),
			},
		});
		const instance = TransformComponent({ amount: "initial" });
		const internals = getConsumerInternals(instance);

		expect(() => checkRenderValidation(instance)).not.toThrow();
		expect(internals.propsPipeline.props.amount).toBe("initial!");

		await instance.updateProps({ label: "updated" });
		expect(internals.propsPipeline.props.amount).toBe("initial!");

		await instance.updateProps({ amount: "next" });
		expect(internals.propsPipeline.props.amount).toBe("next!");
	});

	it("should preserve undefined transform outputs during unrelated updates", async () => {
		const OptionalOutputComponent = create({
			tag: "optional-transform-output-component",
			url: "https://example.com/optional-transform-output",
			props: {
				amount: {
					schema: z
						.string()
						.transform((value) =>
							value === "empty" ? undefined : Number(value),
						),
					outputSchema: z.number().optional(),
				},
				label: z.string().optional(),
			},
		});
		const instance = OptionalOutputComponent({ amount: "empty" });
		const internals = getConsumerInternals(instance);

		expect(() => checkRenderValidation(instance)).not.toThrow();
		expect(internals.propsPipeline.props.amount).toBeUndefined();

		await instance.updateProps({ label: "updated" });
		expect(internals.propsPipeline.props.amount).toBeUndefined();
	});

	it("should not re-check requiredness against transformed outputs", async () => {
		const RequiredOptionalOutputComponent = create({
			tag: "required-optional-transform-output-component",
			url: "https://example.com/required-optional-transform-output",
			props: {
				amount: {
					schema: z
						.string()
						.transform((value) =>
							value === "empty" ? undefined : Number(value),
						),
					outputSchema: z.number().optional(),
				},
				label: z.string().optional(),
			},
		});
		const instance = RequiredOptionalOutputComponent({ amount: "empty" });
		const internals = getConsumerInternals(instance);

		expect(() => checkRenderValidation(instance)).not.toThrow();
		expect(internals.propsPipeline.props.amount).toBeUndefined();

		await expect(
			instance.updateProps({ label: "updated" }),
		).resolves.toBeUndefined();
		expect(internals.propsPipeline.props.amount).toBeUndefined();
	});

	it("should revalidate retained mutable schema inputs before rendering", async () => {
		const safeOrigin = "https://safe.example.com";
		const target = new URL(`${safeOrigin}/component`);
		const MutableUrlComponent = create({
			tag: "mutable-url-schema-component",
			url: (props) => props.target.href,
			domain: safeOrigin,
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
		).rejects.toThrow("Unsafe URL origin");
	});

	it("should recheck time-varying schema policies at trust boundaries", () => {
		const allowedOrigins = new Set(["https://safe.example.com"]);
		const PolicyComponent = create({
			tag: "time-varying-schema-policy-component",
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
			"URL origin is no longer allowed",
		);
	});

	it("should recheck mutable output-compatible defaults", () => {
		const safeOrigin = "https://safe.example.com";
		const sharedDefault = { href: `${safeOrigin}/component` };
		const DefaultPolicyComponent = create({
			tag: "mutable-default-policy-component",
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
			"Unsafe default target",
		);
	});

	it("should recheck mutable normalized values", async () => {
		const safeOrigin = "https://safe.example.com";
		const PolicyComponent = create({
			tag: "mutable-normalized-policy-component",
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
			"Unsafe normalized target",
		);

		const updateInstance = PolicyComponent({
			target: { href: `${safeOrigin}/update` },
		});
		normalizedTarget(updateInstance).href =
			"https://attacker.example.com/update";
		await expect(
			updateInstance.updateProps({ label: "updated" }),
		).rejects.toThrow("Unsafe normalized target");

		const strippedFieldInstance = PolicyComponent({
			target: { href: `${safeOrigin}/stripped-field` },
		});
		normalizedTarget(strippedFieldInstance).elevated = true;
		expect(() => checkRenderValidation(strippedFieldInstance)).toThrow(
			"value no longer matches its normalized schema output",
		);
	});

	it("should recheck normalized values mutated during render callbacks", async () => {
		const safeOrigin = "https://safe.example.com";
		const RenderComponent = create({
			tag: "render-mutated-normalized-policy-component",
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
			"Unsafe normalized render target",
		);
		expect(container.querySelectorAll("iframe")).toHaveLength(0);
		container.remove();
	});

	it("should call component validate on render and updateProps", async () => {
		const validate = vi.fn();
		const MyComponent = create<{ amount: number }>({
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

	it("should trust updated url origin before first render", async () => {
		const DynamicUrlComponent = create<{ targetUrl: string }>({
			tag: "dynamic-origin-trust-component",
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

		const allowedOrigins = Array.from(
			instanceInternal.transport.messenger.allowedOrigins,
		);
		expect(allowedOrigins).toContain("https://origin-b.example.com");
		expect(allowedOrigins).not.toContain("https://origin-a.example.com");

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
			domain: [firstOrigin, secondOrigin],
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
		const DynamicUrlComponent = create<{ targetUrl: string }>({
			tag: "dynamic-origin-sync-update-component",
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

		const resolvedUrlAfterUpdateCall = (
			instance as unknown as {
				resolveUrl: () => string;
			}
		).resolveUrl();

		expect(resolvedUrlAfterUpdateCall).toBe(
			"https://origin-b.example.com/widget",
		);
		await pendingUpdate;
	});

	it("should reject url origin changes after render", async () => {
		const DynamicUrlComponent = create<{ targetUrl: string }>({
			tag: "dynamic-origin-after-render-component",
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
		).rejects.toThrow("Cannot change component URL origin after render");

		instanceInternal.transport.hostWindow = null;
		await expect(instance.updateProps({})).resolves.toBeUndefined();

		const resolvedUrlAfterFailedUpdate = (
			instance as unknown as {
				resolveUrl: () => string;
			}
		).resolveUrl();
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

		it("should work with typed components", () => {
			type MyProps = {
				name: string;
			};

			create<MyProps>({
				tag: "typed-component",
				url: "https://example.com",
				props: {
					name: prop.string(),
				},
			});

			const retrieved = getComponent<MyProps>("typed-component");

			expect(retrieved).toBeDefined();
		});
	});

	describe("unregisterComponent", () => {
		it("should remove a component from the registry", () => {
			create({
				tag: "to-unregister",
				url: "https://example.com",
			});

			expect(getComponent("to-unregister")).toBeDefined();

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

			expect(NewComponent).toBeDefined();
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
		it("should include all registered component tags when anyConsumer is true", async () => {
			const AlphaComponent = create({
				tag: "peer-alpha",
				url: "https://example.com/alpha",
			});
			const BetaComponent = create({
				tag: "peer-beta",
				url: "https://example.com/beta",
			});

			const alphaPrimary = AlphaComponent({});
			const alphaSibling = AlphaComponent({});
			const betaSibling = BetaComponent({});
			setVerifiedHostDomain(
				PEER_HOST_DOMAIN,
				alphaPrimary,
				alphaSibling,
				betaSibling,
			);

			const sameTagSiblings = getSiblingInstances({
				uid: alphaPrimary.uid,
				tag: "peer-alpha",
				hostDomain: PEER_HOST_DOMAIN,
				anyConsumer: false,
			});
			const anyConsumerSiblings = getSiblingInstances({
				uid: alphaPrimary.uid,
				tag: "peer-alpha",
				hostDomain: PEER_HOST_DOMAIN,
				anyConsumer: true,
			});

			expect(sameTagSiblings).toEqual([
				expect.objectContaining({
					uid: alphaSibling.uid,
					tag: "peer-alpha",
				}),
			]);
			expect(anyConsumerSiblings).toEqual(
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
				anyConsumerSiblings.some((sibling) => sibling.uid === alphaPrimary.uid),
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
				url: "https://example.com/alpha",
			});
			const BetaComponent = create({
				tag: "peer-origin-beta",
				url: "https://example.com/beta",
			});

			const requester = AlphaComponent({});
			const sameOrigin = AlphaComponent({});
			const foreignSameTag = AlphaComponent({});
			const foreignOtherTag = BetaComponent({});
			const unconnected = AlphaComponent({});
			const sameOriginOtherTag = BetaComponent({});
			foreignSameTag.exports = { secret: "foreign-same-tag" };
			foreignOtherTag.exports = { secret: "foreign-other-tag" };
			setVerifiedHostDomain(
				PEER_HOST_DOMAIN,
				requester,
				sameOrigin,
				sameOriginOtherTag,
			);
			setVerifiedHostDomain(
				"https://foreign-host.example.com",
				foreignSameTag,
				foreignOtherTag,
			);

			for (const anyConsumer of [false, true]) {
				const uids = getSiblingInstances({
					uid: requester.uid,
					tag: "peer-origin-alpha",
					hostDomain: PEER_HOST_DOMAIN,
					anyConsumer,
				}).map((sibling) => sibling.uid);

				expect(uids).toContain(sameOrigin.uid);
				expect(uids).not.toContain(foreignSameTag.uid);
				expect(uids).not.toContain(foreignOtherTag.uid);
				expect(uids).not.toContain(unconnected.uid);
				expect(uids.includes(sameOriginOtherTag.uid)).toBe(anyConsumer);
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

		it("should let a component admit other host origins through peerDomains", async () => {
			const SharedComponent = create({
				tag: "peer-domains-shared",
				url: "https://widgets-a.myapp.example/widget",
				domain: "https://*.myapp.example",
				peerDomains: "https://*.myapp.example",
			});
			const PrivateComponent = create({
				tag: "peer-domains-private",
				url: "https://widgets-a.myapp.example/private",
				domain: "https://*.myapp.example",
			});

			const requester = SharedComponent({});
			const sharedPeer = SharedComponent({});
			const privatePeer = PrivateComponent({});
			setVerifiedHostDomain("https://widgets-a.myapp.example", requester);
			setVerifiedHostDomain(
				"https://widgets-b.myapp.example",
				sharedPeer,
				privatePeer,
			);
			const lookup = (hostDomain: string) =>
				getSiblingInstances({
					uid: requester.uid,
					tag: "peer-domains-shared",
					hostDomain,
					anyConsumer: true,
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

		it("never lists a peer whose own host is opaque, even when its peerDomains admit the requester", async () => {
			const PartnerComponent = create({
				tag: "peer-domains-opaque-peer",
				url: "https://widgets.myapp.example/widget",
				peerDomains: "https://*.myapp.example",
			});
			const requester = PartnerComponent({});
			const opaquePeer = PartnerComponent({});
			const namedPeer = PartnerComponent({});
			opaquePeer.exports = { secret: "sandboxed document" };
			setVerifiedHostDomain("https://widgets.myapp.example", requester);
			setVerifiedHostDomain("null", opaquePeer);
			setVerifiedHostDomain("https://other.myapp.example", namedPeer);

			expect(
				getSiblingInstances({
					uid: requester.uid,
					tag: "peer-domains-opaque-peer",
					hostDomain: "https://widgets.myapp.example",
					anyConsumer: false,
				}).map((sibling) => sibling.uid),
			).toEqual([namedPeer.uid]);

			await Promise.all(
				[requester, opaquePeer, namedPeer].map((instance) => instance.close()),
			);
		});

		it("should list same-origin peers whose hosts are still loading without exports", async () => {
			const LoadingComponent = create({
				tag: "peer-loading",
				url: "https://example.com/loading",
			});

			const requester = LoadingComponent({});
			const loadingPeer = LoadingComponent({});
			const foreignLoadingPeer = LoadingComponent({});
			loadingPeer.exports = { early: "not yet verified" };
			setVerifiedHostDomain(PEER_HOST_DOMAIN, requester);
			setOpenedHostDomain(PEER_HOST_DOMAIN, loadingPeer);
			setOpenedHostDomain(
				"https://foreign-host.example.com",
				foreignLoadingPeer,
			);

			expect(
				getSiblingInstances({
					uid: requester.uid,
					tag: "peer-loading",
					hostDomain: PEER_HOST_DOMAIN,
					anyConsumer: false,
				}),
			).toEqual([
				{ uid: loadingPeer.uid, tag: "peer-loading", exports: undefined },
			]);

			setVerifiedHostDomain(PEER_HOST_DOMAIN, loadingPeer);
			expect(
				getSiblingInstances({
					uid: requester.uid,
					tag: "peer-loading",
					hostDomain: PEER_HOST_DOMAIN,
					anyConsumer: false,
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
				url: "https://example.com/peer-index-cleanup",
			});

			const primary = IndexedComponent({});
			const sibling = IndexedComponent({});
			setVerifiedHostDomain(PEER_HOST_DOMAIN, primary, sibling);

			expect(
				getSiblingInstances({
					uid: primary.uid,
					tag: "peer-index-cleanup",
					hostDomain: PEER_HOST_DOMAIN,
					anyConsumer: false,
				}),
			).toEqual([
				expect.objectContaining({
					uid: sibling.uid,
					tag: "peer-index-cleanup",
				}),
			]);

			await sibling.close();

			expect(
				getSiblingInstances({
					uid: primary.uid,
					tag: "peer-index-cleanup",
					hostDomain: PEER_HOST_DOMAIN,
					anyConsumer: false,
				}),
			).toEqual([]);

			await primary.close();
		});

		it("should exclude unregistered tags from anyConsumer sibling lookup", async () => {
			const AlphaComponent = create({
				tag: "peer-index-unregister-alpha",
				url: "https://example.com/peer-index-unregister-alpha",
			});
			const BetaComponent = create({
				tag: "peer-index-unregister-beta",
				url: "https://example.com/peer-index-unregister-beta",
			});

			const alphaPrimary = AlphaComponent({});
			const betaSibling = BetaComponent({});
			setVerifiedHostDomain(PEER_HOST_DOMAIN, alphaPrimary, betaSibling);

			const siblingsBeforeUnregister = getSiblingInstances({
				uid: alphaPrimary.uid,
				tag: "peer-index-unregister-alpha",
				hostDomain: PEER_HOST_DOMAIN,
				anyConsumer: true,
			});
			expect(
				siblingsBeforeUnregister.some(
					(sibling) => sibling.uid === betaSibling.uid,
				),
			).toBe(true);

			unregisterComponent("peer-index-unregister-beta");

			const siblingsAfterUnregister = getSiblingInstances({
				uid: alphaPrimary.uid,
				tag: "peer-index-unregister-alpha",
				hostDomain: PEER_HOST_DOMAIN,
				anyConsumer: true,
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
