/**
 * Unit tests for `@/props/definition-checks`.
 *
 * Covers the declaration checks that `create()` and `initHost()` share: data
 * entries, removed options, the required `schema`, `deliverTo` matchers, and
 * parameter names.
 */
import { describe, expect, it, vi } from "vitest";
import { assertPropDefinitions } from "@/props/definition-checks";
import { prop } from "@/props/prop";

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
			).toThrow(REMOVED_SERIALIZATION_ERROR);
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
			'Prop "profile" must be declared as a data field, not a getter or setter',
		);
		expect(lazy).not.toHaveBeenCalled();
		const accessorOption = Object.defineProperty(
			{ schema: prop.any<Record<string, unknown>>() },
			"serialization",
			{ get: () => "json" },
		);
		expect(() => assertPropDefinitions({ profile: accessorOption })).toThrow(
			REMOVED_SERIALIZATION_ERROR,
		);
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
				'Prop "amount" uses the removed "outputSchema" option. Each prop now has one schema, which must accept its own output unchanged. Pass the type the host should receive, accept both forms in one schema (such as z.coerce.number()), or convert the value in the host.',
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
		).toThrow('Prop "amount" uses the removed "outputSchema" option.');
		expect(read).not.toHaveBeenCalled();
	});

	it("requires a schema on a wrapped definition", () => {
		expect(() => assertPropDefinitions({ ref: { queryParam: true } })).toThrow(
			'Prop "ref" needs a schema. Use prop.any() for a value that is deliberately unchecked.',
		);
		expect(() => assertPropDefinitions({ ref: "string" })).toThrow(
			'Prop "ref" must be a schema or a { schema } definition',
		);
	});

	it.each([
		["same-origin", "same-origin"],
		["an origin", "https://pay.example.com"],
		["a wildcard origin", "https://*.example.com"],
		["a RegExp", /^https:\/\/pay\.example\.com$/],
		["an array", ["https://a.example", /^https:\/\/b\.example$/]],
		["an empty array", []],
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
			'Prop "secret" deliverTo must be a non-empty origin string, a RegExp, or an array of them',
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
			"Prop \"secret\" deliverTo cannot list 'same-origin' in an array; pass deliverTo: 'same-origin' on its own, or list origins only",
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
			`Prop "ref" ${option} must be a boolean or a non-empty parameter name. To encode a value, pass the encoded string as its own prop, or build the URL in a url(props) function.`,
		);
	});
});
