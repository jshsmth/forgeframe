import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { validateNormalizedProps } from "@/props/normalize";
import { prop } from "@/props/prop";
import type { StandardSchemaV1 } from "@/props/schema";
import { isDate, isPlainObject } from "@/utils/realm-values";

const timestamp = "2026-10-01T00:00:00.000Z";

describe("Realm-independent value admission", () => {
	it("accepts genuine Date brands across realms and retains invalid-date rejection", () => {
		const date: Date = runInNewContext(
			`new Date(${JSON.stringify(timestamp)})`,
		);
		const invalid: Date = runInNewContext('new Date("invalid")');
		expect(date).not.toBeInstanceOf(Date);
		expect(isDate(date)).toBe(true);
		expect(isDate(invalid)).toBe(true);
		expect(prop.date()["~standard"].validate(date)).toEqual({ value: date });
		expect(prop.date()["~standard"].validate(invalid)).toHaveProperty("issues");
		expect(
			prop.date().min(new Date("2026-10-02"))["~standard"].validate(date),
		).toHaveProperty("issues");
		expect(
			prop.date()["~standard"].validate({
				[Symbol.toStringTag]: "Date",
				getTime: () => 0,
			}),
		).toHaveProperty("issues");
	});

	it("accepts ordinary foreign dictionaries but rejects classes and spoofed brands", () => {
		const dictionary: Record<string, string> = runInNewContext(
			'({ name: "accepted" })',
		);
		const instance: object = runInNewContext(
			'new (class Dictionary { name = "rejected" })()',
		);
		const nullBaseInstance: object = runInNewContext(
			"new (class Dictionary extends null { constructor() { return Object.create(new.target.prototype); } })()",
		);
		expect(isPlainObject(dictionary)).toBe(true);
		expect(
			prop.record(prop.string())["~standard"].validate(dictionary),
		).toEqual({ value: { name: "accepted" } });
		for (const value of [
			instance,
			nullBaseInstance,
			new Date(),
			[],
			Array.prototype,
			Object.setPrototypeOf(["one"], null),
			Object.setPrototypeOf(["one"], Object.prototype),
			new Map(),
			Object.create({ constructor: Object }),
		]) {
			expect(isPlainObject(value)).toBe(false);
			expect(
				prop.record(prop.string())["~standard"].validate(value),
			).toHaveProperty("issues");
		}
		expect(isPlainObject(Object.create(null))).toBe(true);
		expect(isPlainObject(null)).toBe(false);
		expect(isDate("2026-10-01")).toBe(false);
	});

	it("compares equivalent Date and dictionary schema outputs across realms without hiding transformations", () => {
		const date: Date = runInNewContext(
			`new Date(${JSON.stringify(timestamp)})`,
		);
		const record: Record<string, string> = runInNewContext(
			'({ name: "accepted" })',
		);
		const cloneDate: StandardSchemaV1<Date> = {
			"~standard": {
				version: 1,
				vendor: "test",
				validate: () => ({ value: new Date(timestamp) }),
			},
		};
		expect(() =>
			validateNormalizedProps(
				{ date, record },
				{ date: cloneDate, record: prop.record(prop.string()) },
			),
		).not.toThrow();
		const changedDate: StandardSchemaV1<Date> = {
			"~standard": {
				version: 1,
				vendor: "test",
				validate: () => ({ value: new Date("2026-10-02") }),
			},
		};
		expect(() =>
			validateNormalizedProps({ date }, { date: changedDate }),
		).toThrow();
		expect(() =>
			validateNormalizedProps(
				{ record },
				{ record: prop.record(prop.string().trim()) },
			),
		).not.toThrow();
		const untrimmed: Record<string, string> = runInNewContext(
			'({ name: " accepted " })',
		);
		expect(() =>
			validateNormalizedProps(
				{ record: untrimmed },
				{ record: prop.record(prop.string().trim()) },
			),
		).toThrow();
	});
});
