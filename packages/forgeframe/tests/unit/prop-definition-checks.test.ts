/**
 * Unit tests for `@/props/definition-checks`.
 *
 * Covers the declaration checks that `create()` and `initHost()` share: data
 * entries, removed and unknown options, the required `schema`, `deliverTo`
 * matchers, `sendToHost`, and parameter names and their clashes.
 */
import { describe, expect, it, vi } from "vitest";
import { assertPropDefinitions } from "@/props/definition-checks";
import { prop } from "@/props/prop";
import { forgeFrameError } from "../forgeframe-error";

const REMOVED_SERIALIZATION_ERROR =
	'Prop "profile" uses the removed "serialization" option. ForgeFrame 2 always sends props as JSON; remove the option.';

describe("assertPropDefinitions", () => {
	// Public create() cases cover string values and undefined; these cover
	// defined values that are not strings.
	it.each([null, false])(
		"rejects a wrapped definition whose serialization is %j",
		(serialization) => {
			expect(() =>
				assertPropDefinitions({
					label: prop.string(),
					profile: {
						schema: prop.any<Record<string, unknown>>(),
						serialization,
					},
				}),
			).toThrow(forgeFrameError("VALIDATION", REMOVED_SERIALIZATION_ERROR));
		},
	);

	it("rejects accessor-defined entries without invoking them", () => {
		const lazy = vi.fn(() => ({
			schema: prop.any<Record<string, unknown>>(),
			serialization: "json",
		}));
		const definitions = Object.defineProperty({}, "profile", {
			enumerable: true,
			get: lazy,
		});
		expect(() => assertPropDefinitions(definitions)).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Prop "profile" must be declared as a data field, not a getter or setter',
			),
		);
		expect(lazy).not.toHaveBeenCalled();
		const accessorOption = Object.defineProperty(
			{ schema: prop.any<Record<string, unknown>>() },
			"serialization",
			{ get: () => "json" },
		);
		expect(() => assertPropDefinitions({ profile: accessorOption })).toThrow(
			forgeFrameError("VALIDATION", REMOVED_SERIALIZATION_ERROR),
		);
	});

	it.each(["schema", "deliverTo", "sendToHost", "queryParam", "bodyParam"])(
		"rejects a %s getter in a wrapped definition without invoking it",
		(field) => {
			const read = vi.fn(() => undefined);
			const definition = Object.defineProperty(
				field === "schema" ? {} : { schema: prop.string() },
				field,
				{ get: read, enumerable: true },
			);
			expect(() => assertPropDefinitions({ token: definition })).toThrow(
				forgeFrameError(
					"VALIDATION",
					`Prop "token" ${field} must be declared as an own data field, not a getter, setter or inherited field`,
				),
			);
			expect(read).not.toHaveBeenCalled();
		},
	);

	it("rejects an inherited deliverTo accessor in a wrapped definition without invoking it", () => {
		const read = vi.fn(() => "*");
		const inherited = Object.create(
			Object.defineProperty({}, "deliverTo", { get: read }),
		);
		inherited.schema = prop.string();
		expect(() => assertPropDefinitions({ token: inherited })).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Prop "token" deliverTo must be declared as an own data field',
			),
		);
		expect(read).not.toHaveBeenCalled();
	});

	it("ignores direct schemas, undefined entries, and inherited fields", () => {
		const inherited = Object.create({ serialization: "dotify" });
		inherited.schema = prop.any<Record<string, unknown>>();
		expect(() =>
			assertPropDefinitions({
				direct: Object.assign(prop.any<Record<string, unknown>>(), {
					serialization: "dotify",
				}),
				missing: undefined,
				inherited,
			}),
		).not.toThrow();
	});

	it.each([prop.number(), null, { parse: Number }])(
		"rejects the removed outputSchema option set to %j",
		(outputSchema) => {
			expect(() =>
				assertPropDefinitions({
					amount: { schema: prop.number(), outputSchema },
				}),
			).toThrow(
				forgeFrameError(
					"VALIDATION",
					'Prop "amount" uses the removed "outputSchema" option. Each prop now has one schema, which must accept its own output unchanged. Pass the type the host should receive, accept both forms in one schema (such as z.coerce.number()), or convert the value in the host.',
				),
			);
		},
	);

	it("treats an undefined outputSchema as omitted and never invokes an accessor", () => {
		expect(() =>
			assertPropDefinitions({
				amount: { schema: prop.number(), outputSchema: undefined },
			}),
		).not.toThrow();
		const read = vi.fn(() => prop.number());
		const accessorOutputSchema = Object.defineProperty(
			{ schema: prop.number() },
			"outputSchema",
			{ get: read },
		);
		expect(() =>
			assertPropDefinitions({ amount: accessorOutputSchema }),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Prop "amount" uses the removed "outputSchema" option.',
			),
		);
		expect(read).not.toHaveBeenCalled();
	});

	it("requires a schema on a wrapped definition", () => {
		expect(() => assertPropDefinitions({ ref: { queryParam: true } })).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Prop "ref" needs a schema. Use prop.any() for a value that is deliberately unchecked.',
			),
		);
		expect(() => assertPropDefinitions({ ref: "string" })).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Prop "ref" must be a schema or a { schema } definition',
			),
		);
	});

	it.each([
		["same-origin", "same-origin"],
		["an origin", "https://pay.example.com"],
		["a wildcard origin", "https://*.example.com"],
		["a RegExp", /^https:\/\/pay\.example\.com$/],
		["an array", ["https://a.example", /^https:\/\/b\.example$/]],
	])("accepts deliverTo as %s", (_label, deliverTo) => {
		expect(() =>
			assertPropDefinitions({
				secret: { schema: prop.string(), deliverTo },
			}),
		).not.toThrow();
	});

	it.each([
		["an empty string", ""],
		["a blank string", "   "],
		["an array with a blank entry", ["https://a.example", " "]],
		["a number", 1],
	])("rejects deliverTo as %s", (_label, deliverTo) => {
		expect(() =>
			assertPropDefinitions({
				secret: { schema: prop.string(), deliverTo },
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Prop "secret" deliverTo must be a non-empty origin string, a RegExp, or an array of them',
			),
		);
	});

	it("rejects deliverTo as an empty array, which no host could receive", () => {
		expect(() =>
			assertPropDefinitions({
				secret: { schema: prop.string(), deliverTo: [] },
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Prop "secret" deliverTo must list at least one origin; an empty array matches none',
			),
		);
	});

	it("rejects 'same-origin' mixed into a deliverTo array", () => {
		expect(() =>
			assertPropDefinitions({
				secret: {
					schema: prop.string(),
					deliverTo: ["same-origin", "https://a.example"],
				},
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				"Prop \"secret\" deliverTo cannot list 'same-origin' in an array; pass deliverTo: 'same-origin' on its own, or list origins only",
			),
		);
	});

	it.each(["queryParam", "bodyParam"])(
		"accepts %s as a boolean or a parameter name",
		(option) => {
			expect(() =>
				assertPropDefinitions({
					a: { schema: prop.string(), [option]: true },
					b: { schema: prop.string(), [option]: "b_param" },
					c: { schema: prop.string(), [option]: false },
				}),
			).not.toThrow();
		},
	);

	it.each([
		["queryParam", ""],
		["queryParam", " "],
		["queryParam", 1],
		["queryParam", () => "encoded"],
		["bodyParam", ""],
		["bodyParam", () => "encoded"],
	])("rejects %s set to %j", (option, value) => {
		expect(() =>
			assertPropDefinitions({
				ref: { schema: prop.string(), [option]: value },
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				`Prop "ref" ${option} must be a boolean or a non-empty parameter name. To encode a value, pass the encoded string as its own prop, or build the URL in a url(props) function.`,
			),
		);
	});

	it.each([
		["deliverto", "same-origin"],
		["queryparam", true],
		["description", "label"],
	])("rejects the unknown wrapped option %s", (field, value) => {
		expect(() =>
			assertPropDefinitions({
				label: { schema: prop.string(), [field]: value },
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				`Prop "label" has the unknown option "${field}". A wrapped definition accepts only schema, deliverTo, sendToHost, queryParam, bodyParam.`,
			),
		);
	});

	it("rejects an unknown symbol option and ignores an undefined unknown option", () => {
		expect(() =>
			assertPropDefinitions({
				label: { schema: prop.string(), [Symbol("extra")]: true },
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Prop "label" has the unknown option "Symbol(extra)"',
			),
		);
		expect(() =>
			assertPropDefinitions({
				label: { schema: prop.string(), extra: undefined },
			}),
		).not.toThrow();
	});

	it.each(["yes", 1, null])("rejects sendToHost %j", (sendToHost) => {
		expect(() =>
			assertPropDefinitions({ label: { schema: prop.string(), sendToHost } }),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Prop "label" sendToHost must be a boolean',
			),
		);
	});

	it.each(["queryParam", "bodyParam"])(
		"rejects %s with deliverTo: 'same-origin', and accepts false",
		(option) => {
			expect(() =>
				assertPropDefinitions({
					token: {
						schema: prop.string(),
						deliverTo: "same-origin",
						[option]: "token",
					},
				}),
			).toThrow(
				forgeFrameError(
					"VALIDATION",
					`Prop "token" cannot combine ${option} with deliverTo: 'same-origin'`,
				),
			);
			expect(() =>
				assertPropDefinitions({
					token: {
						schema: prop.string(),
						deliverTo: "same-origin",
						[option]: false,
					},
				}),
			).not.toThrow();
		},
	);

	it.each(["queryParam", "bodyParam"])(
		"rejects two props that share a %s name, including a key used by true",
		(option) => {
			expect(() =>
				assertPropDefinitions({
					ref: { schema: prop.string(), [option]: true },
					other: { schema: prop.string(), [option]: "ref" },
				}),
			).toThrow(
				forgeFrameError(
					"VALIDATION",
					`Props "ref" and "other" both use the ${option} name "ref"; one value would overwrite the other`,
				),
			);
			expect(() =>
				assertPropDefinitions({
					ref: { schema: prop.string(), queryParam: "ref" },
					other: { schema: prop.string(), bodyParam: "ref" },
				}),
			).not.toThrow();
		},
	);
});
