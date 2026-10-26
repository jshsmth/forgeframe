import type { ComponentOptions, ForgeFrameComponent } from "../types/runtime";

const componentRegistry = new Map<
	string,
	ForgeFrameComponent<Record<string, unknown>>
>();

const INTERNAL_COMPONENT_OPTIONS = Symbol("forgeframe.component.options");

type InternalForgeFrameComponent<
	P extends Record<string, unknown> = Record<string, unknown>,
	X = unknown,
	SchemaInputs = P,
> = ForgeFrameComponent<P, X, false, SchemaInputs> & {
	[INTERNAL_COMPONENT_OPTIONS]?: ComponentOptions<P, SchemaInputs>;
};

export function registerComponent<
	P extends Record<string, unknown>,
	X,
	SchemaInputs,
>(
	component: ForgeFrameComponent<P, X, false, SchemaInputs>,
	options: ComponentOptions<P, SchemaInputs>,
): void {
	(component as InternalForgeFrameComponent<P, X, SchemaInputs>)[
		INTERNAL_COMPONENT_OPTIONS
	] = options;
	componentRegistry.set(
		options.tag,
		component as ForgeFrameComponent<Record<string, unknown>>,
	);
}

export function hasRegisteredComponent(tag: string): boolean {
	return componentRegistry.has(tag);
}

export function getRegisteredComponent<
	P extends Record<string, unknown> = Record<string, unknown>,
	X = unknown,
	SchemaInputs = P,
>(tag: string): ForgeFrameComponent<P, X, false, SchemaInputs> | undefined {
	return componentRegistry.get(tag) as
		| ForgeFrameComponent<P, X, false, SchemaInputs>
		| undefined;
}

export function getComponentOptions<
	P extends Record<string, unknown> = Record<string, unknown>,
	X = unknown,
	SchemaInputs = P,
>(
	/** Any factory returned by `create()`, whatever its props and exports. */
	component: object,
): ComponentOptions<P, SchemaInputs> | undefined {
	return (
		component as unknown as InternalForgeFrameComponent<P, X, SchemaInputs>
	)[INTERNAL_COMPONENT_OPTIONS];
}

export function deleteRegisteredComponent(tag: string): void {
	componentRegistry.delete(tag);
}

export function clearRegisteredComponents(): void {
	componentRegistry.clear();
}
