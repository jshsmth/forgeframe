/**
 * Unit tests for props normalization and host/query/body mapping utilities.
 *
 * Covers schema-decided presence and defaults, the "validate unchanged" check
 * every trust boundary shares, the delivery policy for `sendToHost` and
 * `deliverTo`, and query/body parameter encoding.
 */
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	createDeliveryTarget,
	getPropsForHost,
	isPropDelivered,
	normalizeProps,
	propsToBodyParams,
	propsToQueryParams,
	validateUnchanged,
} from "@/props/normalize";
import { prop } from "@/props/prop";
import type { StandardSchemaV1 } from "@/props/schema";
import type { PropDefinition, PropsDefinition } from "@/types";
import { forgeFrameError } from "../forgeframe-error";

const crossOriginHost = {
	hostOrigin: "https://host.example.com",
	sameOrigin: false,
};

describe("Props Normalization", () => {
	it("omits a prop whose definition is undefined", () => {
		const definitions: PropsDefinition<{ timeout: number }> = {
			// @ts-expect-error JavaScript callers may leave an entry undefined.
			timeout: undefined,
		};
		expect(normalizeProps({ timeout: 1 }, definitions)).toEqual({});
		expect(
			getPropsForHost({ timeout: 1 }, definitions, crossOriginHost),
		).toEqual({});
	});

	it.each(["toString", "constructor", "hasOwnProperty"])(
		"uses own values and defaults for %s",
		(key) => {
			const definitions: PropsDefinition<Record<string, string | undefined>> = {
				[key]: prop.string().optional(),
			};
			const omitted = normalizeProps({}, definitions);
			expect(Object.hasOwn(omitted, key)).toBe(true);
			expect(omitted[key]).toBeUndefined();
			expect(
				normalizeProps({}, { [key]: prop.string().default("fallback") })[key],
			).toBe("fallback");
			expect(normalizeProps({ [key]: "supplied" }, definitions)[key]).toBe(
				"supplied",
			);
		},
	);

	it("applies schema defaults for omitted and explicitly undefined props", () => {
		const definitions = {
			name: prop.string().default("default-name"),
			count: { schema: prop.number().default(0), queryParam: true },
		} as const;

		expect(normalizeProps({ name: "custom-name" }, definitions)).toEqual({
			name: "custom-name",
			count: 0,
		});
		expect(
			normalizeProps({ name: undefined, count: undefined }, definitions),
		).toEqual({ name: "default-name", count: 0 });
	});

	it("calls a callback default as a factory", () => {
		const onCancel = vi.fn();
		const factory = vi.fn(() => onCancel);
		const definitions = { onCancel: prop.function().default(factory) };

		expect(normalizeProps({}, definitions).onCancel).toBe(onCancel);
		expect(onCancel).not.toHaveBeenCalled();
	});

	it("requires direct and wrapped props whose schemas reject undefined, with one message", () => {
		const definitions = {
			direct: prop.string(),
			wrapped: { schema: prop.string(), queryParam: true },
		};

		expect(() => normalizeProps({ wrapped: "ok" }, definitions)).toThrow(
			forgeFrameError("VALIDATION", "Validation failed: direct: Required"),
		);
		expect(() => normalizeProps({ direct: "ok" }, definitions)).toThrow(
			forgeFrameError("VALIDATION", "Validation failed: wrapped: Required"),
		);
	});

	it("keeps a wrapped prop optional only when its schema accepts undefined", () => {
		const definitions = {
			ref: { schema: prop.string().optional(), queryParam: true },
		};

		expect(normalizeProps({}, definitions)).toEqual({ ref: undefined });
	});

	it("applies schema transforms and refinements", () => {
		const definitions = {
			name: prop.string().trim().min(2),
		};

		expect(normalizeProps({ name: "  Ada  " }, definitions)).toEqual({
			name: "Ada",
		});
		expect(() => normalizeProps({ name: " A " }, definitions)).toThrow(
			forgeFrameError("VALIDATION", "Validation failed: name:"),
		);
	});

	it("should normalize only declared props", () => {
		expect(
			normalizeProps(
				{ dimensions: { width: 1, height: 1 }, onClose: vi.fn() },
				{},
			),
		).toEqual({});
	});

	it.each([
		["string", prop.string(), "valid", 123],
		["boolean", prop.boolean(), true, "yes"],
		["function", prop.function(), () => {}, "not a function"],
		["array", prop.array(prop.string()), ["a", "b"], "not an array"],
		["object", prop.object({ key: prop.string() }), { key: "v" }, [1, 2, 3]],
		["number", prop.number(), 1, "not a number"],
	])("validates a %s prop", (_kind, schema, valid, invalid) => {
		const definitions = { value: schema } as PropsDefinition<
			Record<string, unknown>
		>;

		expect(normalizeProps({ value: valid }, definitions).value).toEqual(valid);
		expect(() => normalizeProps({ value: invalid }, definitions)).toThrow(
			forgeFrameError("VALIDATION", "Validation failed: value:"),
		);
	});
});

describe("validateUnchanged", () => {
	it.each([
		["a Date with the same time", prop.date(), new Date(0)],
		[
			"a URL with the same href",
			prop.any<URL>(),
			new URL("https://a.example/"),
		],
		[
			"a nested record",
			prop.record(prop.object({ tags: prop.array(prop.string()) })),
			{ first: { tags: ["a", "b"] } },
		],
		["a trimmed string", z.string().trim(), "ready"],
	])("accepts %s unchanged", (_label, schema, value) => {
		expect(validateUnchanged(schema, value, "value")).toEqual({
			status: "unchanged",
		});
	});

	it("reports a value the schema changes", () => {
		expect(
			validateUnchanged(
				z.object({ name: z.string() }),
				{ name: "Ada", role: "admin" },
				"profile",
			),
		).toEqual({ status: "changed" });
		expect(
			validateUnchanged(
				z.date().transform((date) => new Date(date.getTime() + 1)),
				new Date(0),
				"startsAt",
			),
		).toEqual({ status: "changed" });
		expect(
			validateUnchanged(
				z.array(z.number()).transform((items) => [...items, 0]),
				[1],
				"items",
			),
		).toEqual({ status: "changed" });
	});

	/** A schema that accepts anything and returns `output`. */
	function returning(output: unknown): StandardSchemaV1 {
		return {
			"~standard": {
				version: 1,
				vendor: "test",
				validate: () => ({ value: output }),
			},
		};
	}
	class Point {
		x = 1;
	}
	const cyclic = (): Record<string, unknown> => {
		const value: Record<string, unknown> = { name: "loop" };
		value.self = value;
		return value;
	};
	const cycleToCopy = (): Record<string, unknown> => {
		const inner: Record<string, unknown> = { name: "loop" };
		inner.self = inner;
		return { name: "loop", self: inner };
	};

	it.each([
		[
			"a URL with another href",
			new URL("https://a.example/"),
			new URL("https://b.example/"),
		],
		[
			"a URL turned into its string",
			new URL("https://a.example/"),
			"https://a.example/",
		],
		["an array turned into an object", [1], { 0: 1 }],
		["an object turned into an array", { 0: 1 }, [1]],
		["a class instance turned into a plain object", new Point(), { x: 1 }],
		["a plain object turned into a class instance", { x: 1 }, new Point()],
		["a non-plain object with the same prototype", new Map(), new Map()],
		["a cycle that points elsewhere", cyclic(), cycleToCopy()],
	])("reports %s as changed", (_label, input, output) => {
		expect(validateUnchanged(returning(output), input, "value")).toEqual({
			status: "changed",
		});
	});

	it("accepts a cyclic value whose output has the same cycle", () => {
		expect(validateUnchanged(returning(cyclic()), cyclic(), "value")).toEqual({
			status: "unchanged",
		});
	});

	it("reports the schema's issues for a value it rejects", () => {
		expect(
			validateUnchanged(z.string().transform(Number), 42, "amount"),
		).toEqual({
			status: "rejected",
			issues: "amount: Invalid input: expected string, received number",
		});
	});
});

describe("Delivery policy", () => {
	it.each([
		["https://app.example.com", "https://app.example.com", true],
		["https://app.example.com", "https://other.example.com", false],
		// Opaque documents all serialize as "null", so equal strings prove nothing.
		["null", "null", false],
	])(
		"createDeliveryTarget(%s, %s) is same-origin: %s",
		(hostOrigin, consumerOrigin, sameOrigin) => {
			expect(createDeliveryTarget(hostOrigin, consumerOrigin)).toEqual({
				hostOrigin,
				sameOrigin,
			});
		},
	);

	const sameOriginHost = {
		hostOrigin: "https://app.example.com",
		sameOrigin: true,
	};

	it.each<
		[
			string,
			Pick<PropDefinition, "sendToHost" | "deliverTo">,
			{ hostOrigin: string; sameOrigin: boolean },
			boolean,
		]
	>([
		["an unrestricted prop", {}, crossOriginHost, true],
		["a consumer-only prop", { sendToHost: false }, sameOriginHost, false],
		[
			"a same-origin prop to a same-origin host",
			{ deliverTo: "same-origin" },
			sameOriginHost,
			true,
		],
		[
			"a same-origin prop to a cross-origin host",
			{ deliverTo: "same-origin" },
			crossOriginHost,
			false,
		],
		[
			"a same-origin prop to an opaque host",
			{ deliverTo: "same-origin" },
			{ hostOrigin: "null", sameOrigin: false },
			false,
		],
		[
			"a matcher prop to an admitted host",
			{ deliverTo: "https://host.example.com" },
			crossOriginHost,
			true,
		],
		[
			"a wildcard prop to an admitted host",
			{ deliverTo: "https://*.example.com" },
			crossOriginHost,
			true,
		],
		[
			"a RegExp prop to another host",
			{ deliverTo: /^https:\/\/pay\.example\.com$/ },
			crossOriginHost,
			false,
		],
		[
			"an array prop to a listed host",
			{ deliverTo: ["https://other.example", "https://host.example.com"] },
			crossOriginHost,
			true,
		],
		["an empty-array prop", { deliverTo: [] }, crossOriginHost, false],
		[
			"a consumer-only matcher prop",
			{ sendToHost: false, deliverTo: "https://host.example.com" },
			crossOriginHost,
			false,
		],
	])("decides %s", (_label, definition, target, delivered) => {
		expect(isPropDelivered(definition, target)).toBe(delivered);
	});

	it("selects only delivered props for a host", () => {
		const definitions: PropsDefinition<{
			visible: string;
			hidden: string;
			secret: string;
			partner: string;
		}> = {
			visible: prop.string(),
			hidden: { schema: prop.string(), sendToHost: false },
			secret: { schema: prop.string(), deliverTo: "same-origin" },
			partner: {
				schema: prop.string(),
				deliverTo: ["https://trusted.com", "https://also-trusted.com"],
			},
		};
		const props = {
			visible: "yes",
			hidden: "no",
			secret: "sensitive",
			partner: "value",
		};

		expect(
			getPropsForHost(props, definitions, {
				hostOrigin: "https://trusted.com",
				sameOrigin: false,
			}),
		).toEqual({ visible: "yes", partner: "value" });
		expect(
			getPropsForHost(props, definitions, {
				hostOrigin: "https://consumer.com",
				sameOrigin: true,
			}),
		).toEqual({ visible: "yes", secret: "sensitive" });
	});
});

describe.each(["queryParam", "bodyParam"] as const)(
	"Initial request parameters (%s)",
	(option) => {
		const toParams =
			option === "queryParam" ? propsToQueryParams : propsToBodyParams;

		it("applies host delivery policy before encoding", () => {
			const definitions: PropsDefinition<{
				local: string;
				sameOrigin: string;
				trusted: string;
				rejected: string;
			}> = {
				local: { schema: prop.string(), [option]: true, sendToHost: false },
				sameOrigin: {
					schema: prop.string(),
					[option]: true,
					deliverTo: "same-origin",
				},
				trusted: {
					schema: prop.string(),
					[option]: true,
					deliverTo: ["https://host.example.com"],
				},
				rejected: {
					schema: prop.string(),
					[option]: true,
					deliverTo: ["https://other.example.com"],
				},
			};

			const params = toParams(
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

		it("uses the prop key for true and the given name for a string", () => {
			const definitions: PropsDefinition<{
				token: string;
				userId: string;
				secret: string;
			}> = {
				token: { schema: prop.string(), [option]: true },
				userId: { schema: prop.string(), [option]: "user_id" },
				secret: prop.string(),
			};

			const params = toParams(
				{ token: "abc123", userId: "123", secret: "hidden" },
				definitions,
				"https://host.example.com",
			);

			expect(Object.fromEntries(params)).toEqual({
				token: "abc123",
				user_id: "123",
			});
		});

		it("encodes dates as ISO strings and other objects as JSON", () => {
			const definitions: PropsDefinition<{
				config: { key: string };
				at: Date;
				count: number;
			}> = {
				config: {
					schema: prop.object({ key: prop.string() }),
					[option]: true,
				},
				at: { schema: prop.date(), [option]: true },
				count: { schema: prop.number(), [option]: true },
			};

			const params = toParams(
				{
					config: { key: "value" },
					at: new Date("2026-01-02T03:04:05.000Z"),
					count: 3,
				},
				definitions,
				"https://host.example.com",
			);

			expect(Object.fromEntries(params)).toEqual({
				config: JSON.stringify({ key: "value" }),
				at: "2026-01-02T03:04:05.000Z",
				count: "3",
			});
		});

		it("omits functions, undefined, null, and invalid dates", () => {
			const definitions: PropsDefinition<{
				callback: () => void;
				optional?: string;
				empty: string | null;
				invalid: Date;
			}> = {
				callback: { schema: prop.function(), [option]: true },
				optional: { schema: prop.string().optional(), [option]: true },
				empty: { schema: prop.string().nullable(), [option]: true },
				invalid: { schema: prop.any<Date>(), [option]: true },
			};

			const params = toParams(
				{
					callback: () => {},
					optional: undefined,
					empty: null,
					invalid: new Date(Number.NaN),
				},
				definitions,
				"https://host.example.com",
			);

			expect([...params.keys()]).toEqual([]);
		});
	},
);
