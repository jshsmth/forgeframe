/**
 * @packageDocumentation
 * Component factory and registry module.
 *
 * @remarks
 * This module provides the main entry point for creating ForgeFrame components.
 * It manages a global registry of all defined components and handles component
 * creation, validation, and lifecycle management.
 */

import type {
  ComponentOptions,
  ConsumerPropsInput,
  ForgeFrameComponent,
  ForgeFrameComponentInstance,
  HostProps,
  InferablePropsDefinition,
  InferredComponentOptions,
} from '../types/runtime';
import type {
  InferPropsDefinition,
  InferPropsDefinitionInput,
  HostPropsDefinition,
} from '../types/props';
import type { StandardSchemaV1 } from '../props/schema';
import { ConsumerComponent } from './consumer';
import {
  clearIndexedInstances,
  clearIndexedInstancesByTag,
  getComponentInstancesByTag as getComponentInstancesByTagFromIndex,
  getIndexedComponentInstances as getIndexedComponentInstancesFromIndex,
  indexComponentInstance,
  removeIndexedComponentInstance,
  type IndexedComponentInstance,
} from './component-instance-index';
import { getHost, initHost } from './host';
import { HOST_PROPS_BUILTIN_KEYS } from './host/builtin-keys';
import { isHostOfComponent } from '../window/name-payload';
import { hasBrowserWindow } from '../utils/browser';
import { resolveComponentHostUrl } from '../utils/url';
import {
  clearRegisteredComponents,
  deleteRegisteredComponent,
  getComponentOptions,
  getRegisteredComponent,
  getRegisteredComponentEntries,
  getRegisteredComponentTags,
  hasRegisteredComponent,
  registerComponent,
} from './component-registry';

/**
 * Validates component configuration options.
 *
 * @param options - The component options to validate
 * @throws Error if tag is missing, invalid, or already registered
 * @throws Error if url is missing
 * @internal
 */
function validateComponentOptions<P, I, SchemaInputs>(
  options: ComponentOptions<P, I, SchemaInputs>
): void {
  if (!options.tag) {
    throw new Error('Component tag is required');
  }

  if (!/^[a-z][a-z0-9-]*$/.test(options.tag)) {
    throw new Error(
      `Invalid component tag "${options.tag}". Must start with lowercase letter and contain only lowercase letters, numbers, and hyphens.`
    );
  }

  if (!options.url) {
    throw new Error('Component url is required');
  }

  if (options.props) {
    for (const key of Object.keys(options.props)) {
      if (HOST_PROPS_BUILTIN_KEYS.has(key)) {
        throw new Error(
          `Prop "${key}" is reserved by hostProps built-ins and cannot be defined as a custom prop`
        );
      }
    }
  }

  // Validate URL format if it's a string (can't validate function URLs at definition time)
  if (typeof options.url === 'string') {
    const browserAvailable = hasBrowserWindow();
    const validationBaseUrl = browserAvailable
      ? window.location.origin
      : 'https://forgeframe.invalid';
    let hasAbsoluteUrl = true;

    try {
      new URL(options.url);
    } catch {
      hasAbsoluteUrl = false;
    }

    // A relative URL has no real origin until it is resolved in a browser.
    // Validate its syntax and protocol here, then enforce the domain policy
    // against the actual resolved URL when an instance renders.
    resolveComponentHostUrl(
      options.url,
      validationBaseUrl,
      browserAvailable || hasAbsoluteUrl ? options.domain : undefined
    );
  }

  if (hasRegisteredComponent(options.tag)) {
    throw new Error(`Component "${options.tag}" is already registered`);
  }
}

/**
 * Creates a new ForgeFrame component definition.
 *
 * @remarks
 * This is the main entry point for defining components. It creates a factory
 * function that can be called with props to create component instances.
 * Equivalent to zoid.create() for migration purposes.
 *
 * @typeParam P - The props type for the component
 * @typeParam X - The exports type that the host can expose
 * @typeParam I - An alternate consumer input shape, such as legacy alias keys
 * @typeParam SchemaInputs - Canonical input types accepted by prop schemas
 * @param options - Component configuration options
 * @returns A component factory function
 *
 * @example
 * ```typescript
 * import ForgeFrame, { prop } from 'forgeframe';
 *
 * const LoginComponent = ForgeFrame.create({
 *   tag: 'login-component',
 *   url: 'https://auth.example.com/login',
 *   props: {
 *     email: prop.string(),
 *     onLogin: prop.function<(user: { id: string }) => void>(),
 *   },
 * });
 *
 * const instance = LoginComponent({ email: 'user@example.com', onLogin: () => {} });
 * await instance.render('#container');
 * ```
 *
 * @public
 */
export function create<
  const D extends InferablePropsDefinition,
  X = unknown,
  I extends Record<string, unknown> = InferPropsDefinitionInput<D>,
  ContextualSchemas extends Record<string, StandardSchemaV1> = {
    [K in keyof D]: D[K] extends StandardSchemaV1
      ? D[K]
      : D[K] extends { schema: infer Schema extends StandardSchemaV1 }
        ? Schema
        : never;
  },
>(
  options: InferredComponentOptions<D, ContextualSchemas>
): ForgeFrameComponent<
  InferPropsDefinition<D>,
  X,
  I,
  Record<PropertyKey, never> extends ConsumerPropsInput<
    InferPropsDefinition<D>,
    I,
    InferPropsDefinitionInput<D>
  >
    ? false
    : true,
  InferPropsDefinitionInput<D>
>;
export function create<
  P extends Record<string, unknown> = Record<string, unknown>,
  X = unknown,
  I extends Record<string, unknown> = P,
  SchemaInputs extends Record<string, unknown> = I,
>(
  options: ComponentOptions<P, I, SchemaInputs>
): ForgeFrameComponent<P, X, I, false, SchemaInputs>;
export function create<
  P extends Record<string, unknown> = Record<string, unknown>,
  X = unknown,
  I extends Record<string, unknown> = P,
  SchemaInputs extends Record<string, unknown> = I,
>(
  options: ComponentOptions<P, I, SchemaInputs>
): ForgeFrameComponent<P, X, I, false, SchemaInputs> {
  validateComponentOptions(options);
  const runtimeOptions = options;

  const instances: ForgeFrameComponentInstance<P, X, I, SchemaInputs>[] = [];
  const componentTag = options.tag;
  let componentHostProps: HostProps<P> | undefined;

  function trackInstance(
    instance: ConsumerComponent<P, X, I, SchemaInputs>
  ): ConsumerComponent<P, X, I, SchemaInputs> {
    if (instance.isDestroyed()) {
      return instance;
    }

    instances.push(instance);
    indexComponentInstance(componentTag, instance);

    instance.event.once('destroy', () => {
      const index = instances.indexOf(instance);
      if (index !== -1) {
        instances.splice(index, 1);
      }

      removeIndexedComponentInstance(instance.uid);
    });

    return instance;
  }

  function createTrackedInstance(
    props?: ConsumerPropsInput<P, I, SchemaInputs>
  ): ConsumerComponent<P, X, I, SchemaInputs> {
    return trackInstance(
      new ConsumerComponent<P, X, I, SchemaInputs>(
        runtimeOptions,
        props,
        trackInstance
      )
    );
  }

  const canDetectComponentHost = (): boolean => {
    return hasBrowserWindow() && isHostOfComponent(options.tag);
  };

  const syncHostProps = (): HostProps<P> | undefined => {
    if (componentHostProps) {
      return componentHostProps;
    }

    const activeHost = getHost<P, SchemaInputs>();
    if (activeHost?.hostProps.tag === options.tag) {
      const configuredHost = initHost<P, SchemaInputs>(
        runtimeOptions.props as HostPropsDefinition<P, SchemaInputs> | undefined,
        options.allowedConsumerDomains
      );
      componentHostProps = configuredHost?.hostProps;
      return componentHostProps;
    }

    if (!canDetectComponentHost()) {
      return undefined;
    }

    const host = initHost<P, SchemaInputs>(
      runtimeOptions.props as HostPropsDefinition<P, SchemaInputs> | undefined,
      options.allowedConsumerDomains
    );
    if (!host) {
      return undefined;
    }

    componentHostProps = host.hostProps;
    return componentHostProps;
  };

  syncHostProps();

  const detectHostState = (): boolean => {
    syncHostProps();
    return componentHostProps !== undefined || canDetectComponentHost();
  };

  /**
   * Component factory function that creates new instances.
   * @param props - Props to pass to the component instance
   * @returns A new component instance
   */
  const Component = function (
    props?: ConsumerPropsInput<P, I, SchemaInputs>
  ): ForgeFrameComponentInstance<P, X, I, SchemaInputs> {
    return createTrackedInstance(props);
  } as unknown as ForgeFrameComponent<P, X, I, false, SchemaInputs>;

  Component.instances = instances;

  Component.isHost = (): boolean => {
    return detectHostState();
  };

  Component.isEmbedded = (): boolean => {
    return detectHostState();
  };

  Object.defineProperty(Component, 'hostProps', {
    configurable: true,
    enumerable: true,
    get: () => syncHostProps(),
  });

  Component.canRenderTo = async (win: Window): Promise<boolean> => {
    // Cross-window render targets are not currently supported.
    return win === window;
  };

  registerComponent(Component, runtimeOptions);

  return Component;
}

/**
 * Retrieves a registered component by its tag name.
 *
 * @typeParam P - The props type for the component
 * @typeParam X - The exports type that the host can expose
 * @param tag - The unique tag identifier of the component
 * @returns The component factory function, or undefined if not found
 *
 * @example
 * ```typescript
 * const LoginComponent = getComponent('login-component');
 * if (LoginComponent) {
 *   LoginComponent({ email: 'user@example.com' }).render('#container');
 * }
 * ```
 *
 * @public
 */
export function getComponent<
  P extends Record<string, unknown> = Record<string, unknown>,
  X = unknown,
  I = P,
  SchemaInputs = I,
>(
  tag: string
): ForgeFrameComponent<P, X, I, false, SchemaInputs> | undefined {
  return getRegisteredComponent<P, X, I, SchemaInputs>(tag);
}

/**
 * Returns all registered components as tag/component pairs.
 * @internal
 */
export function getRegisteredComponents(): Array<
  [string, ForgeFrameComponent<Record<string, unknown>>]
> {
  return getRegisteredComponentEntries();
}

/**
 * Returns active instances for a specific component tag using an internal index.
 * @internal
 */
export function getComponentInstancesByTag(tag: string): IndexedComponentInstance[] {
  return getComponentInstancesByTagFromIndex(tag);
}

/**
 * Returns all active indexed instances across tags.
 * @internal
 */
export function getIndexedComponentInstances(): Array<{ tag: string; instance: IndexedComponentInstance }> {
  return getIndexedComponentInstancesFromIndex();
}

/**
 * Returns the internal options metadata for a component factory.
 * @internal
 */
export { getComponentOptions };

/**
 * Destroys a single component instance.
 *
 * @remarks
 * This closes the component and cleans up all associated resources.
 *
 * @typeParam P - The props type for the component
 * @param instance - The component instance to destroy
 *
 * @example
 * ```typescript
 * const instance = MyComponent({ prop: 'value' });
 * await instance.render('#container');
 * // Later...
 * await destroy(instance);
 * ```
 *
 * @public
 */
export async function destroy<
  P extends Record<string, unknown>,
  I = P,
  SchemaInputs = I,
>(
  instance: ForgeFrameComponentInstance<P, unknown, I, SchemaInputs>
): Promise<void> {
  await instance.close();
}

/**
 * Destroys all instances of a specific component by its tag name.
 *
 * @remarks
 * Useful for cleanup when a component type is no longer needed.
 * This destroys all active instances of the component with the given tag.
 *
 * @param tag - The component tag name to destroy all instances of
 *
 * @example
 * ```typescript
 * // Destroy all login component instances
 * await destroyByTag('login-component');
 * ```
 *
 * @public
 */
export async function destroyByTag(tag: string): Promise<void> {
  const component = getRegisteredComponent(tag);
  if (!component) return;

  const instances = [...component.instances];
  await Promise.all(instances.map((instance) => instance.close()));
}

/**
 * Destroys all ForgeFrame component instances.
 *
 * @remarks
 * This is a global cleanup function that destroys every component
 * instance across all component types.
 *
 * @example
 * ```typescript
 * // Clean up everything on page unload
 * window.addEventListener('beforeunload', () => {
 *   destroyAll();
 * });
 * ```
 *
 * @public
 */
export async function destroyAll(): Promise<void> {
  const tags = getRegisteredComponentTags();
  await Promise.all(tags.map((tag) => destroyByTag(tag)));
}

/**
 * Removes a component from the registry.
 *
 * @remarks
 * Primarily used for testing and cleanup. Does not destroy active instances.
 *
 * @param tag - The component tag to unregister
 * @internal
 */
export function unregisterComponent(tag: string): void {
  deleteRegisteredComponent(tag);
  clearIndexedInstancesByTag(tag);
}

/**
 * Clears all components from the registry.
 *
 * @remarks
 * Primarily used for testing and cleanup. Does not destroy active instances.
 *
 * @internal
 */
export function clearComponents(): void {
  clearRegisteredComponents();
  clearIndexedInstances();
}
