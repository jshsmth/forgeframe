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
  ForgeFrameComponent,
  ForgeFrameComponentInstance,
  HostProps,
} from '../types';
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

/**
 * Global registry of all defined components.
 * @internal
 */
const componentRegistry = new Map<string, ForgeFrameComponent<Record<string, unknown>>>();

/**
 * Internal symbol used to attach component options metadata to component factories.
 * @internal
 */
const INTERNAL_COMPONENT_OPTIONS = Symbol('forgeframe.component.options');

/**
 * Component factory augmented with internal metadata.
 * @internal
 */
type InternalForgeFrameComponent<
  P extends Record<string, unknown> = Record<string, unknown>,
  X = unknown,
> = ForgeFrameComponent<P, X> & {
  [INTERNAL_COMPONENT_OPTIONS]?: ComponentOptions<P>;
};

/**
 * Validates component configuration options.
 *
 * @param options - The component options to validate
 * @throws Error if tag is missing, invalid, or already registered
 * @throws Error if url is missing
 * @internal
 */
function validateComponentOptions<P>(options: ComponentOptions<P>): void {
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
    try {
      const validationBaseUrl = hasBrowserWindow()
        ? window.location.origin
        : 'https://forgeframe.invalid';
      new URL(options.url, validationBaseUrl);
    } catch {
      throw new Error(
        `Invalid component URL "${options.url}". Must be a valid absolute or relative URL.`
      );
    }
  }

  if (componentRegistry.has(options.tag)) {
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
export function create<P extends Record<string, unknown> = Record<string, unknown>, X = unknown>(
  options: ComponentOptions<P>
): ForgeFrameComponent<P, X> {
  validateComponentOptions(options);

  const instances: ForgeFrameComponentInstance<P, X>[] = [];
  let componentHostProps: HostProps<P> | undefined;

  const canDetectComponentHost = (): boolean => {
    return hasBrowserWindow() && isHostOfComponent(options.tag);
  };

  const syncHostProps = (): HostProps<P> | undefined => {
    if (componentHostProps) {
      return componentHostProps;
    }

    const activeHost = getHost<P>();
    if (activeHost?.hostProps.tag === options.tag) {
      const configuredHost = initHost<P>(options.props, options.allowedConsumerDomains);
      componentHostProps = configuredHost?.hostProps;
      return componentHostProps;
    }

    if (!canDetectComponentHost()) {
      return undefined;
    }

    const host = initHost<P>(options.props, options.allowedConsumerDomains);
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
  const Component = function (props: Partial<P> = {} as Partial<P>): ForgeFrameComponentInstance<P, X> {
    const instance = new ConsumerComponent<P, X>(options, props);
    const internalInstance = instance as unknown as ForgeFrameComponentInstance<P, X> & {
      destroyed?: boolean;
    };

    if (internalInstance.destroyed) {
      return instance;
    }

    instances.push(instance);
    indexComponentInstance(options.tag, instance);

    instance.event.once('destroy', () => {
      const index = instances.indexOf(instance);
      if (index !== -1) {
        instances.splice(index, 1);
      }

      removeIndexedComponentInstance(instance.uid);
    });

    return instance;
  } as ForgeFrameComponent<P, X>;

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

  (Component as InternalForgeFrameComponent<P, X>)[INTERNAL_COMPONENT_OPTIONS] = options;

  Component.canRenderTo = async (win: Window): Promise<boolean> => {
    // Cross-window render targets are not currently supported.
    return win === window;
  };

  componentRegistry.set(options.tag, Component as ForgeFrameComponent<Record<string, unknown>>);

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
export function getComponent<P extends Record<string, unknown> = Record<string, unknown>, X = unknown>(
  tag: string
): ForgeFrameComponent<P, X> | undefined {
  return componentRegistry.get(tag) as ForgeFrameComponent<P, X> | undefined;
}

/**
 * Returns all registered components as tag/component pairs.
 * @internal
 */
export function getRegisteredComponents(): Array<
  [string, ForgeFrameComponent<Record<string, unknown>>]
> {
  return Array.from(componentRegistry.entries());
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
export function getComponentOptions<
  P extends Record<string, unknown> = Record<string, unknown>,
  X = unknown,
>(component: ForgeFrameComponent<P, X>): ComponentOptions<P> | undefined {
  return (component as InternalForgeFrameComponent<P, X>)[INTERNAL_COMPONENT_OPTIONS];
}

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
export async function destroy<P extends Record<string, unknown>>(
  instance: ForgeFrameComponentInstance<P>
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
  const component = componentRegistry.get(tag);
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
  const tags = Array.from(componentRegistry.keys());
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
  componentRegistry.delete(tag);
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
  componentRegistry.clear();
  clearIndexedInstances();
}
