import type {
  ComponentOptions,
  ForgeFrameComponent,
  ForgeFrameComponentReference,
} from '../types/runtime';

const componentRegistry = new Map<
  string,
  ForgeFrameComponent<Record<string, unknown>>
>();

const INTERNAL_COMPONENT_OPTIONS = Symbol('forgeframe.component.options');

type InternalForgeFrameComponent<
  P extends Record<string, unknown> = Record<string, unknown>,
  X = unknown,
  I = P,
  SchemaInputs = I,
> = ForgeFrameComponent<P, X, I, false, SchemaInputs> & {
  [INTERNAL_COMPONENT_OPTIONS]?: ComponentOptions<P, I, SchemaInputs>;
};

export function registerComponent<
  P extends Record<string, unknown>,
  X,
  I,
  SchemaInputs,
>(
  component: ForgeFrameComponent<P, X, I, false, SchemaInputs>,
  options: ComponentOptions<P, I, SchemaInputs>
): void {
  (component as InternalForgeFrameComponent<P, X, I, SchemaInputs>)[INTERNAL_COMPONENT_OPTIONS] = options;
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
  I = P,
  SchemaInputs = I,
>(tag: string): ForgeFrameComponent<P, X, I, false, SchemaInputs> | undefined {
  return componentRegistry.get(tag) as
    | ForgeFrameComponent<P, X, I, false, SchemaInputs>
    | undefined;
}

export function getRegisteredComponentEntries(): Array<
  [string, ForgeFrameComponent<Record<string, unknown>>]
> {
  return Array.from(componentRegistry.entries());
}

export function getComponentOptions<
  P extends Record<string, unknown> = Record<string, unknown>,
  X = unknown,
  I = P,
  SchemaInputs = I,
>(
  component: ForgeFrameComponentReference
): ComponentOptions<P, I, SchemaInputs> | undefined {
  return (
    component as unknown as InternalForgeFrameComponent<
      P,
      X,
      I,
      SchemaInputs
    >
  )[INTERNAL_COMPONENT_OPTIONS];
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
