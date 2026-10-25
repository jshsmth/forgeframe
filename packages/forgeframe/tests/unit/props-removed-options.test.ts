/**
 * Unit tests for `@/props/removed-options`.
 *
 * Covers the declaration policy that `create()` and `initHost()` share for
 * prop-definition options removed in ForgeFrame 2.
 */
import { describe, expect, it, vi } from "vitest";
import { prop } from "@/props/prop";
import { assertNoRemovedPropOptions } from "@/props/removed-options";

const REMOVED_SERIALIZATION_ERROR =
	'Prop "profile" uses the removed "serialization" option. ForgeFrame 2 always sends props as JSON; remove the option.';

describe("assertNoRemovedPropOptions", () => {
	// Public create() cases cover string values and undefined; these cover
	// defined values that are not strings.
	it.each([null, false])(
		"rejects a wrapped definition whose serialization is %j",
		(serialization) => {
			expect(() =>
				assertNoRemovedPropOptions({
					label: prop.string(),
					profile: { schema: prop.object(), serialization },
				}),
			).toThrow(REMOVED_SERIALIZATION_ERROR);
		},
	);

	it("reads descriptors without invoking accessor-defined entries", () => {
		const lazy = vi.fn(() => ({
			schema: prop.object(),
			serialization: "json",
		}));
		const definitions = Object.defineProperty({}, "profile", {
			enumerable: true,
			get: lazy,
		});
		expect(() => assertNoRemovedPropOptions(definitions)).not.toThrow();
		expect(lazy).not.toHaveBeenCalled();
		const accessorOption = Object.defineProperty(
			{ schema: prop.object() },
			"serialization",
			{ get: () => "json" },
		);
		expect(() =>
			assertNoRemovedPropOptions({ profile: accessorOption }),
		).toThrow(REMOVED_SERIALIZATION_ERROR);
	});

	it("ignores direct schemas, undefined entries, and inherited fields", () => {
		const inherited = Object.create({ serialization: "dotify" });
		inherited.schema = prop.object();
		expect(() =>
			assertNoRemovedPropOptions({
				direct: Object.assign(prop.object(), { serialization: "dotify" }),
				missing: undefined,
				inherited,
			}),
		).not.toThrow();
	});
});
