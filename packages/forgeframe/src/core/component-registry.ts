import type {
  ComponentOptions,
  ForgeFrameComponent,
} from '../types/runtime';

const componentRegistry = new Map<
  string,
  ForgeFrameComponent<Record<string, unknown>>
>();

const INTERNAL_COMPONENT_OPTIONS = Symbol('forgeframe.component.options');

type InternalForgeFrameComponent<
  P extends Record<string, unknown> = Record<string, unknown>,
  X = unknown,
> = ForgeFrameComponent<P, X> & {
  [INTERNAL_COMPONENT_OPTIONS]?: ComponentOptions<P>;
};

export function registerComponent<P extends Record<string, unknown>, X>(
  component: ForgeFrameComponent<P, X>,
  options: ComponentOptions<P>
): void {
  (component as InternalForgeFrameComponent<P, X>)[INTERNAL_COMPONENT_OPTIONS] = options;
  componentRegistry.set(
    options.tag,
    component as ForgeFrameComponent<Record<string, unknown>>
  );
}

export function hasRegisteredComponent(tag: string): boolean {
  return componentRegistry.has(tag);
}

export function getRegisteredComponent<
  P extends Record<string, unknown> = Record<string, unknown>,
  X = unknown,
>(tag: string): ForgeFrameComponent<P, X> | undefined {
  return componentRegistry.get(tag) as ForgeFrameComponent<P, X> | undefined;
}

export function getRegisteredComponentEntries(): Array<
  [string, ForgeFrameComponent<Record<string, unknown>>]
> {
  return Array.from(componentRegistry.entries());
}

export function getComponentOptions<
  P extends Record<string, unknown> = Record<string, unknown>,
  X = unknown,
>(component: ForgeFrameComponent<P, X>): ComponentOptions<P> | undefined {
  return (component as InternalForgeFrameComponent<P, X>)[INTERNAL_COMPONENT_OPTIONS];
}

export function getRegisteredComponentTags(): string[] {
  return Array.from(componentRegistry.keys());
}

export function deleteRegisteredComponent(tag: string): void {
  componentRegistry.delete(tag);
}

export function clearRegisteredComponents(): void {
  componentRegistry.clear();
}
