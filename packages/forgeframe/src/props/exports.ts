/**
 * @packageDocumentation
 * Exports schema validation shared by the consumer and the host.
 *
 * @remarks
 * The component's `exports` schema validates only. Exports are kept as
 * received, with their remote function wrappers and `Date` values, so the
 * schema must return a valid value unchanged, as prop schemas must.
 */

import { assertValidatesUnchanged, validateUnchanged } from "./normalize";
import type { StandardSchemaV1 } from "./schema";

/**
 * Validates exported data against the component's `exports` schema; without
 * a schema every value passes.
 *
 * @throws ForgeFrameError `VALIDATION` with the schema's "Validation failed"
 * message, or when the schema changes the value or is async
 * @internal
 */
export function validateExports(
	schema: StandardSchemaV1 | undefined,
	exports: unknown,
): void {
	if (schema === undefined) return;
	assertValidatesUnchanged(
		validateUnchanged(schema, exports, "exports"),
		"exports: the exports schema must return the exported value unchanged, because ForgeFrame keeps exports as received; remove transforms, keep unknown keys, and use prop.function() for methods (Zod's z.function() wraps them)",
	);
}
