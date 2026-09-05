/**
 * Unit tests for props normalization and host/query/body mapping utilities.
 *
 * Covers defaults/computed values, schema validation, host filtering rules, and parameter conversion.
 */
import { describe, expect, it, vi } from "vitest";
import { BUILTIN_PROP_DEFINITIONS } from "@/props/definitions";
import {
	getPropsForHost,
	normalizeProps,
	propsToBodyParams,
	propsToQueryParams,
	validateProps,
} from "@/props/normalize";
import { prop } from "@/props/prop";
import { isStandardSchema } from "@/props/schema";
import type { PropContext, PropsDefinition } from "@/types";

describe("Props Normalization", () => {
	const createContext = <P extends Record<string, unknown>>(
		props: Partial<P> = {},
	): PropContext<P> => ({
		props: props as P,
		uid: "test-uid",
		tag: "test-tag",
		close: vi.fn(),
		focus: vi.fn(),
		resize: vi.fn(),
		onError: vi.fn(),
		event: {
			on: vi.fn(),
			once: vi.fn(),
			emit: vi.fn(),
			off: vi.fn(),
			removeAllListeners: vi.fn(),
		},
	});

	it("should merge user props with defaults", () => {
		const definitions: PropsDefinition<{ name: string; count: number }> = {
			name: prop.string().default("default-name"),
			count: prop.number().default(0),
		};

		const result = normalizeProps(
			{ name: "custom-name" },
			definitions,
			createContext(),
		);

		expect(result.name).toBe("custom-name");
		expect(result.count).toBe(0);
	});

	it("should handle function defaults", () => {
		const definitions: PropsDefinition<{ timestamp: number }> = {
			timestamp: {
				schema: prop.number(),
				default: () => 12345,
			},
		};

		const result = normalizeProps({}, definitions, createContext());

		expect(result.timestamp).toBe(12345);
	});

	it("should handle computed values", () => {
		const definitions: PropsDefinition<{ computed: string }> = {
			computed: {
				schema: prop.string(),
				value: (ctx) => `uid:${ctx.uid}`,
			},
		};

		const result = normalizeProps({}, definitions, createContext());

		expect(result.computed).toBe("uid:test-uid");
	});

	it("should treat explicit undefined as missing for wrapped defaults", () => {
		const definitions: PropsDefinition<{ label: string }> = {
			label: {
				schema: prop.string(),
				default: "fallback",
			},
		};

		const result = normalizeProps(
			{ label: undefined } as unknown as { label: string },
			definitions,
			createContext(),
		);

		expect(result.label).toBe("fallback");
	});

	it("should treat explicit undefined as missing for wrapped computed values", () => {
		const definitions: PropsDefinition<{ label: string }> = {
			label: {
				schema: prop.string(),
				value: () => "computed",
			},
		};

		const result = normalizeProps(
			{ label: undefined } as unknown as { label: string },
			definitions,
			createContext(),
		);

		expect(result.label).toBe("computed");
	});

	it("should handle prop aliases", () => {
		const definitions: PropsDefinition<{ email: string }> = {
			email: {
				schema: prop.string(),
				alias: "userEmail",
			},
		};

		const result = normalizeProps(
			{ userEmail: "test@example.com" } as Record<string, unknown>,
			definitions,
			createContext(),
		);

		expect(result.email).toBe("test@example.com");
	});

	it("should apply decorate function", () => {
		const definitions: PropsDefinition<{ name: string }> = {
			name: {
				schema: prop.string(),
				decorate: ({ value }) => (value as string).toUpperCase(),
			},
		};

		const result = normalizeProps(
			{ name: "hello" },
			definitions,
			createContext(),
		);

		expect(result.name).toBe("HELLO");
	});

	it("should include builtin props", () => {
		const result = normalizeProps({}, {}, createContext());

		// Should have builtin props with defaults
		expect(result.dimensions).toBeDefined();
		expect(result.timeout).toBeDefined();
	});
});

describe("Props Validation", () => {
	it("should throw for missing required props", () => {
		const definitions: PropsDefinition<{ email: string }> = {
			email: { schema: prop.string(), required: true },
		};

		expect(() =>
			validateProps(
				{ email: undefined } as unknown as { email: string },
				definitions,
			),
		).toThrow('Prop "email" is required');
	});

	it("should throw for invalid type via schema", () => {
		const definitions: PropsDefinition<{ count: number }> = {
			count: prop.number(),
		};

		expect(() =>
			validateProps(
				{ count: "not a number" } as unknown as { count: number },
				definitions,
			),
		).toThrow("Expected number");
	});

	it("should validate string type", () => {
		const definitions: PropsDefinition<{ name: string }> = {
			name: prop.string(),
		};

		expect(() => validateProps({ name: "valid" }, definitions)).not.toThrow();
		expect(() =>
			validateProps({ name: 123 } as unknown as { name: string }, definitions),
		).toThrow();
	});

	it("should validate boolean type", () => {
		const definitions: PropsDefinition<{ active: boolean }> = {
			active: prop.boolean(),
		};

		expect(() => validateProps({ active: true }, definitions)).not.toThrow();
		expect(() =>
			validateProps(
				{ active: "yes" } as unknown as { active: boolean },
				definitions,
			),
		).toThrow();
	});

	it("should validate function type", () => {
		const definitions: PropsDefinition<{ callback: () => void }> = {
			callback: prop.function(),
		};

		expect(() =>
			validateProps({ callback: () => {} }, definitions),
		).not.toThrow();
		expect(() =>
			validateProps(
				{ callback: "not a function" } as unknown as { callback: () => void },
				definitions,
			),
		).toThrow();
	});

	it("should validate array type", () => {
		const definitions: PropsDefinition<{ items: string[] }> = {
			items: prop.array(),
		};

		expect(() =>
			validateProps({ items: ["a", "b"] }, definitions),
		).not.toThrow();
		expect(() =>
			validateProps(
				{ items: "not an array" } as unknown as { items: string[] },
				definitions,
			),
		).toThrow();
	});

	it("should validate object type", () => {
		const definitions: PropsDefinition<{ data: Record<string, unknown> }> = {
			data: prop.object(),
		};

		expect(() =>
			validateProps({ data: { key: "value" } }, definitions),
		).not.toThrow();
		expect(() =>
			validateProps(
				{ data: [1, 2, 3] } as unknown as { data: Record<string, unknown> },
				definitions,
			),
		).toThrow(); // Arrays should not pass as objects
	});

	it("should call custom validate function", () => {
		const customValidate = vi.fn();
		const definitions: PropsDefinition<{ email: string }> = {
			email: {
				schema: prop.string(),
				validate: customValidate,
			},
		};

		validateProps({ email: "test@example.com" }, definitions);

		expect(customValidate).toHaveBeenCalledWith({
			value: "test@example.com",
			props: expect.any(Object),
		});
	});

	it("should skip undefined optional props with PropDefinition", () => {
		const definitions: PropsDefinition<{ optional?: string }> = {
			optional: { schema: prop.string().optional(), required: false },
		};

		expect(() =>
			validateProps(
				{ optional: undefined } as { optional?: string },
				definitions,
			),
		).not.toThrow();
	});

	it("should skip undefined optional props with direct schema", () => {
		const definitions: PropsDefinition<{ optional?: string }> = {
			optional: prop.string().optional(),
		};

		expect(() =>
			validateProps(
				{ optional: undefined } as { optional?: string },
				definitions,
			),
		).not.toThrow();
	});

	it("should call wrapped custom validators for omitted optional props", () => {
		const validate = vi.fn();
		const definitions: PropsDefinition<{ optional?: string }> = {
			optional: {
				schema: prop.string(),
				validate,
			},
		};

		validateProps({ optional: undefined }, definitions);

		expect(validate).toHaveBeenCalledWith({
			value: undefined,
			props: { optional: undefined },
		});
	});
});

describe("Props for Host", () => {
	it("should filter props with sendToHost: false", () => {
		const definitions: PropsDefinition<{ visible: string; hidden: string }> = {
			visible: { schema: prop.string(), sendToHost: true },
			hidden: { schema: prop.string(), sendToHost: false },
		};

		const result = getPropsForHost(
			{ visible: "yes", hidden: "no" },
			definitions,
			"https://host.com",
			false,
		);

		expect(result.visible).toBe("yes");
		expect(result.hidden).toBeUndefined();
	});

	it("should filter sameDomain props when cross-domain", () => {
		const definitions: PropsDefinition<{ secret: string }> = {
			secret: { schema: prop.string(), sameDomain: true },
		};

		const crossDomainResult = getPropsForHost(
			{ secret: "sensitive" },
			definitions,
			"https://other.com",
			false,
		);

		const sameDomainResult = getPropsForHost(
			{ secret: "sensitive" },
			definitions,
			"https://consumer.com",
			true,
		);

		expect(crossDomainResult.secret).toBeUndefined();
		expect(sameDomainResult.secret).toBe("sensitive");
	});

	it("should filter by trustedDomains", () => {
		const definitions: PropsDefinition<{ data: string }> = {
			data: {
				schema: prop.string(),
				trustedDomains: ["https://trusted.com", "https://also-trusted.com"],
			},
		};

		const trustedResult = getPropsForHost(
			{ data: "value" },
			definitions,
			"https://trusted.com",
			false,
		);

		const untrustedResult = getPropsForHost(
			{ data: "value" },
			definitions,
			"https://untrusted.com",
			false,
		);

		expect(trustedResult.data).toBe("value");
		expect(untrustedResult.data).toBeUndefined();
	});

	it("should apply hostDecorate function", () => {
		const definitions: PropsDefinition<{ value: string }> = {
			value: {
				schema: prop.string(),
				hostDecorate: ({ value }) => `host:${value}`,
			},
		};

		const result = getPropsForHost(
			{ value: "test" },
			definitions,
			"https://host.com",
			false,
		);

		expect(result.value).toBe("host:test");
	});

	it("should validate host-decorated values against the output schema", () => {
		const definitions: PropsDefinition<{ value: string }> = {
			value: {
				schema: prop.string(),
				outputSchema: prop.string().url(),
				hostDecorate: () => "not-a-url",
			},
		};

		expect(() =>
			getPropsForHost(
				{ value: "https://safe.example.com" },
				definitions,
				"https://host.com",
				false,
			),
		).toThrow("Invalid URL");
	});
});

describe("Props to Query Params", () => {
	it("should apply host delivery policy before putting props in a URL", () => {
		const definitions: PropsDefinition<{
			local: string;
			sameOrigin: string;
			trusted: string;
			rejected: string;
		}> = {
			local: { schema: prop.string(), queryParam: true, sendToHost: false },
			sameOrigin: { schema: prop.string(), queryParam: true, sameDomain: true },
			trusted: {
				schema: prop.string(),
				queryParam: true,
				trustedDomains: "https://host.example.com",
			},
			rejected: {
				schema: prop.string(),
				queryParam: true,
				trustedDomains: "https://other.example.com",
			},
		};

		const params = propsToQueryParams(
			{
				local: "private",
				sameOrigin: "not-yet-verified",
				trusted: "allowed",
				rejected: "private",
			},
			definitions,
			"https://host.example.com",
		);

		expect(Object.fromEntries(params)).toEqual({ trusted: "allowed" });
	});

	it("should convert props with queryParam: true", () => {
		const definitions: PropsDefinition<{ token: string; secret: string }> = {
			token: { schema: prop.string(), queryParam: true },
			secret: { schema: prop.string() },
		};

		const params = propsToQueryParams(
			{ token: "abc123", secret: "hidden" },
			definitions,
		);

		expect(params.get("token")).toBe("abc123");
		expect(params.get("secret")).toBeNull();
	});

	it("should use custom param name", () => {
		const definitions: PropsDefinition<{ userId: string }> = {
			userId: { schema: prop.string(), queryParam: "user_id" },
		};

		const params = propsToQueryParams({ userId: "123" }, definitions);

		expect(params.get("user_id")).toBe("123");
	});

	it("should use custom transform function", () => {
		const definitions: PropsDefinition<{ data: { a: number } }> = {
			data: {
				schema: prop.object(),
				queryParam: ({ value }) => btoa(JSON.stringify(value)),
			},
		};

		const params = propsToQueryParams({ data: { a: 1 } }, definitions);

		expect(params.get("data")).toBe(btoa(JSON.stringify({ a: 1 })));
	});

	it("should JSON stringify objects", () => {
		const definitions: PropsDefinition<{ config: Record<string, unknown> }> = {
			config: { schema: prop.object(), queryParam: true },
		};

		const params = propsToQueryParams(
			{ config: { key: "value" } },
			definitions,
		);

		expect(params.get("config")).toBe(JSON.stringify({ key: "value" }));
	});

	it("should skip function props", () => {
		const definitions: PropsDefinition<{ callback: () => void }> = {
			callback: { schema: prop.function(), queryParam: true },
		};

		const params = propsToQueryParams({ callback: () => {} }, definitions);

		expect(params.get("callback")).toBeNull();
	});

	it("should skip undefined values", () => {
		const definitions: PropsDefinition<{ optional?: string }> = {
			optional: { schema: prop.string().optional(), queryParam: true },
		};

		const params = propsToQueryParams(
			{ optional: undefined } as { optional?: string },
			definitions,
		);

		expect(params.get("optional")).toBeNull();
	});
});

describe("Props to Body Params", () => {
	it("should apply host delivery policy before putting props in a POST body", () => {
		const definitions: PropsDefinition<{
			local: string;
			sameOrigin: string;
			trusted: string;
		}> = {
			local: { schema: prop.string(), bodyParam: true, sendToHost: false },
			sameOrigin: { schema: prop.string(), bodyParam: true, sameDomain: true },
			trusted: {
				schema: prop.string(),
				bodyParam: true,
				trustedDomains: "https://host.example.com",
			},
		};

		const params = propsToBodyParams(
			{ local: "private", sameOrigin: "not-yet-verified", trusted: "allowed" },
			definitions,
			"https://host.example.com",
		);

		expect(Object.fromEntries(params)).toEqual({ trusted: "allowed" });
	});

	it("should convert props with bodyParam: true", () => {
		const definitions: PropsDefinition<{ token: string; secret: string }> = {
			token: { schema: prop.string(), bodyParam: true },
			secret: { schema: prop.string() },
		};

		const params = propsToBodyParams(
			{ token: "abc123", secret: "hidden" },
			definitions,
		);

		expect(params.get("token")).toBe("abc123");
		expect(params.get("secret")).toBeNull();
	});

	it("should use custom body param name", () => {
		const definitions: PropsDefinition<{ userId: string }> = {
			userId: { schema: prop.string(), bodyParam: "user_id" },
		};

		const params = propsToBodyParams({ userId: "123" }, definitions);

		expect(params.get("user_id")).toBe("123");
	});

	it("should use custom body transform function", () => {
		const definitions: PropsDefinition<{ data: { a: number } }> = {
			data: {
				schema: prop.object(),
				bodyParam: ({ value }) => btoa(JSON.stringify(value)),
			},
		};

		const params = propsToBodyParams({ data: { a: 1 } }, definitions);

		expect(params.get("data")).toBe(btoa(JSON.stringify({ a: 1 })));
	});

	it("should JSON stringify objects in body params", () => {
		const definitions: PropsDefinition<{ config: Record<string, unknown> }> = {
			config: { schema: prop.object(), bodyParam: true },
		};

		const params = propsToBodyParams({ config: { key: "value" } }, definitions);

		expect(params.get("config")).toBe(JSON.stringify({ key: "value" }));
	});

	it("should skip function props and undefined values", () => {
		const definitions: PropsDefinition<{
			callback: () => void;
			optional?: string;
		}> = {
			callback: { schema: prop.function(), bodyParam: true },
			optional: { schema: prop.string().optional(), bodyParam: true },
		};

		const params = propsToBodyParams(
			{ callback: () => {}, optional: undefined } as {
				callback: () => void;
				optional?: string;
			},
			definitions,
		);

		expect(params.get("callback")).toBeNull();
		expect(params.get("optional")).toBeNull();
	});
});

describe("BUILTIN_PROP_DEFINITIONS", () => {
	it("should have uid prop with schema", () => {
		expect(BUILTIN_PROP_DEFINITIONS.uid).toBeDefined();
		expect(BUILTIN_PROP_DEFINITIONS.uid.schema).toBeDefined();
		expect(isStandardSchema(BUILTIN_PROP_DEFINITIONS.uid.schema)).toBe(true);
	});

	it("should have tag prop with schema", () => {
		expect(BUILTIN_PROP_DEFINITIONS.tag).toBeDefined();
		expect(BUILTIN_PROP_DEFINITIONS.tag.schema).toBeDefined();
		expect(isStandardSchema(BUILTIN_PROP_DEFINITIONS.tag.schema)).toBe(true);
	});

	it("should have dimensions prop with default", () => {
		expect(BUILTIN_PROP_DEFINITIONS.dimensions).toBeDefined();
		expect(BUILTIN_PROP_DEFINITIONS.dimensions.schema).toBeDefined();
		expect(isStandardSchema(BUILTIN_PROP_DEFINITIONS.dimensions.schema)).toBe(
			true,
		);
	});

	it("should have timeout prop with default", () => {
		expect(BUILTIN_PROP_DEFINITIONS.timeout).toBeDefined();
		expect(BUILTIN_PROP_DEFINITIONS.timeout.schema).toBeDefined();
		expect(isStandardSchema(BUILTIN_PROP_DEFINITIONS.timeout.schema)).toBe(
			true,
		);
	});

	it("should have lifecycle callbacks", () => {
		const lifecycleProps = [
			"onDisplay",
			"onRendered",
			"onRender",
			"onPrerendered",
			"onPrerender",
			"onClose",
			"onDestroy",
			"onResize",
			"onFocus",
			"onError",
			"onProps",
		];

		for (const propName of lifecycleProps) {
			expect(BUILTIN_PROP_DEFINITIONS[propName]).toBeDefined();
			expect(BUILTIN_PROP_DEFINITIONS[propName].schema).toBeDefined();
			expect(isStandardSchema(BUILTIN_PROP_DEFINITIONS[propName].schema)).toBe(
				true,
			);
			expect(BUILTIN_PROP_DEFINITIONS[propName].sendToHost).toBe(false);
		}
	});
});
