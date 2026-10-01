const objectConstructorSource = Function.prototype.toString.call(Object);

/** Recognizes the Date internal brand across realms, including invalid dates. */
export function isDate(value: unknown): value is Date {
	if (typeof value !== "object" || value === null) return false;
	try {
		Date.prototype.getTime.call(value);
		return true;
	} catch {
		return false;
	}
}

/** Recognizes ordinary and null-prototype records without admitting class instances. */
export function isPlainObject(
	value: unknown,
): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return false;
	const prototype = Object.getPrototypeOf(value);
	if (prototype === null || prototype === Object.prototype) return true;
	if (Object.getPrototypeOf(prototype) !== null) return false;
	const constructorDescriptor = Object.getOwnPropertyDescriptor(
		prototype,
		"constructor",
	);
	return (
		constructorDescriptor !== undefined &&
		"value" in constructorDescriptor &&
		typeof constructorDescriptor.value === "function" &&
		constructorDescriptor.value.prototype === prototype &&
		Function.prototype.toString.call(constructorDescriptor.value) ===
			objectConstructorSource
	);
}
