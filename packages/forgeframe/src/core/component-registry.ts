import type { Component, ComponentOptions } from "../types/runtime";

const componentRegistry = new Map<string, Component>();

const INTERNAL_COMPONENT_OPTIONS = Symbol("forgeframe.component.options");

type InternalForgeFrameComponent = Component & {
	[INTERNAL_COMPONENT_OPTIONS]?: ComponentOptions;
};

export function registerComponent(
	component: Component,
	options: ComponentOptions,
): void {
	(component as InternalForgeFrameComponent)[INTERNAL_COMPONENT_OPTIONS] =
		options;
	componentRegistry.set(options.tag, component);
}

export function hasRegisteredComponent(tag: string): boolean {
	return componentRegistry.has(tag);
}

export function getRegisteredComponent(tag: string): Component | undefined {
	return componentRegistry.get(tag);
}

export function getComponentOptions(
	/** Any factory returned by `create()`, whatever its props and exports. */
	component: object,
): ComponentOptions | undefined {
	return (component as InternalForgeFrameComponent)[INTERNAL_COMPONENT_OPTIONS];
}

export function deleteRegisteredComponent(tag: string): void {
	componentRegistry.delete(tag);
}

export function clearRegisteredComponents(): void {
	componentRegistry.clear();
}
