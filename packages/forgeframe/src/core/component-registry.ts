import type {
	AnyFactoryInput,
	ComponentOptions,
	ForgeFrameComponent,
} from "../types/runtime";

const componentRegistry = new Map<
	string,
	ForgeFrameComponent<Record<string, unknown>>
>();

const INTERNAL_COMPONENT_OPTIONS = Symbol("forgeframe.component.options");

type InternalForgeFrameComponent<
	P extends Record<string, unknown> = Record<string, unknown>,
	X = unknown,
> = ForgeFrameComponent<P, X, false> & {
	[INTERNAL_COMPONENT_OPTIONS]?: ComponentOptions<P>;
};

export function registerComponent<P extends Record<string, unknown>, X>(
	component: ForgeFrameComponent<P, X, false, AnyFactoryInput>,
	options: ComponentOptions<P>,
): void {
	(component as InternalForgeFrameComponent<P, X>)[INTERNAL_COMPONENT_OPTIONS] =
		options;
	componentRegistry.set(
		options.tag,
		component as unknown as ForgeFrameComponent<Record<string, unknown>>,
	);
}

export function hasRegisteredComponent(tag: string): boolean {
	return componentRegistry.has(tag);
}

export function getRegisteredComponent<
	P extends Record<string, unknown> = Record<string, unknown>,
	X = unknown,
>(tag: string): ForgeFrameComponent<P, X, false> | undefined {
	return componentRegistry.get(tag) as
		| ForgeFrameComponent<P, X, false>
		| undefined;
}

export function getComponentOptions<
	P extends Record<string, unknown> = Record<string, unknown>,
	X = unknown,
>(
	/** Any factory returned by `create()`, whatever its props and exports. */
	component: object,
): ComponentOptions<P> | undefined {
	return (component as unknown as InternalForgeFrameComponent<P, X>)[
		INTERNAL_COMPONENT_OPTIONS
	];
}

export function deleteRegisteredComponent(tag: string): void {
	componentRegistry.delete(tag);
}

export function clearRegisteredComponents(): void {
	componentRegistry.clear();
}
