import type {
  ConsumerPropsInput,
  ConsumerPropsUpdate,
  ForgeFrameComponent,
  ForgeFrameComponentInstance,
} from '../types/runtime';
import type { ContextType } from '../constants';
import { PROP_RESET } from '../core/consumer/props-pipeline';

/**
 * Minimal React-like interface for driver compatibility.
 *
 * @remarks
 * These are minimal type definitions to avoid requiring `@types/react` as a dependency.
 * The driver only uses a subset of React's API, so any React-compatible library
 * (such as Preact with compat) can be used as long as it implements these methods.
 *
 * @internal
 */
interface ReactLike<E> {
  createElement: (...args: never[]) => E;
  useRef: (...args: never[]) => unknown;
  useEffect: (...args: never[]) => unknown;
  useState: (...args: never[]) => unknown;
  forwardRef: (...args: never[]) => unknown;
}

/** Internal callable shape used after the public compatibility check. @internal */
interface ReactRuntime<E> {
  createElement: (
    type: string,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ) => E;
  useRef: <T>(initial: T | null) => { current: T | null };
  useEffect: (effect: () => void | (() => void), deps?: unknown[]) => void;
  useState: <T>(initial: T) => [T, (v: T) => void];
  forwardRef: <T, P>(
    render: (
      props: P,
      ref: ((value: T | null) => void) | { current: T | null } | null
    ) => E
  ) => ReactComponentType<P, E>;
}

/**
 * Props for the generated React component wrapper.
 *
 * @remarks
 * These props are available on all React components created by the driver,
 * in addition to the component-specific props defined in the ForgeFrame component.
 *
 * @typeParam _P - The component-specific props type (unused in base interface)
 *
 * @public
 */
export interface ReactComponentProps<_P = unknown> {
  /** Ref to the container element, cleared when the wrapper unmounts. */
  ref?:
    | ((value: HTMLDivElement | null) => void)
    | { current: HTMLDivElement | null }
    | null;

  /**
   * Callback invoked when the component has finished rendering.
   *
   * @remarks
   * This is called once the cross-domain component has been fully mounted
   * and is visible to the user.
   */
  onRendered?: () => void;

  /**
   * Callback invoked when the component encounters an error.
   *
   * @param error - The error that occurred during rendering or operation
   *
   * @remarks
   * Errors can occur during initial render, prop updates, or cross-domain communication.
   */
  onError?: (error: Error) => void;

  /**
   * Callback invoked when the component is closed.
   *
   * @remarks
   * This is triggered when the cross-domain component is programmatically closed
   * or when the user closes a popup window.
   */
  onClose?: () => void;

  /**
   * The rendering context for the component.
   *
   * @remarks
   * Determines whether the component renders in an iframe or popup window.
   * Defaults to the component's configured default context.
   */
  context?: ContextType;

  /**
   * CSS class name applied to the container element.
   *
   * @remarks
   * The container is a `div` element that wraps the iframe or serves as
   * the anchor point for popup positioning.
   */
  className?: string;

  /**
   * Inline styles applied to the container element.
   *
   * @remarks
   * These styles are merged with the default container styles.
   * The container defaults to `display: inline-block`.
   */
  style?: Record<string, string | number>;
}

/**
 * Full props type combining driver props with component-specific props.
 *
 * @typeParam P - The component-specific props type from the ForgeFrame component
 * @typeParam I - An alternate consumer input shape, such as legacy alias keys
 * @typeParam RequireProps - Whether the wrapped factory requires initial props
 * @typeParam SchemaInputs - Canonical values accepted by each prop schema
 *
 * @remarks
 * This type merges {@link ReactComponentProps} with the component's initial
 * input shape. Components whose factories require props preserve those
 * requirements, while optional factories continue to accept partial props.
 *
 * @internal
 */
type FullReactComponentProps<
  P,
  I = P,
  RequireProps extends boolean = false,
  SchemaInputs = I,
> = ReactComponentProps<P> &
  (RequireProps extends true
    ? ConsumerPropsInput<P, I, SchemaInputs>
    : ConsumerPropsUpdate<P, I, SchemaInputs>);

/**
 * Performs a shallow equality check for prop objects.
 * @internal
 */
function shallowEqualProps(
  prev: Record<string, unknown>,
  next: Record<string, unknown>
): boolean {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);

  if (prevKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of prevKeys) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      return false;
    }

    if (!Object.is(prev[key], next[key])) {
      return false;
    }
  }

  return true;
}

/** Reports React driver errors without allowing observer failures to break lifecycle work. @internal */
function reportReactError(
  callback: ((error: Error) => void) | undefined,
  error: Error
): void {
  if (!callback) {
    return;
  }

  try {
    const result = (callback as (reportedError: Error) => unknown)(error);
    if (
      result &&
      typeof result === 'object' &&
      'catch' in result &&
      typeof result.catch === 'function'
    ) {
      (result as Promise<unknown>).catch((callbackError: unknown) => {
        console.error('Error in React onError callback:', callbackError);
      });
    }
  } catch (callbackError) {
    console.error('Error in React onError callback:', callbackError);
  }
}

/** A committed React prop snapshot waiting to be synchronized. @internal */
interface ReactPropUpdate {
  desired: Record<string, unknown>;
  payload: Record<string, unknown>;
  retryOnFailure: boolean;
}

/** Per-instance state for serializing React prop updates. @internal */
interface ReactPropSyncState<
  P extends Record<string, unknown>,
  X,
  I extends Record<string, unknown>,
  SchemaInputs extends Record<string, unknown>,
> {
  instance: ForgeFrameComponentInstance<P, X, I, SchemaInputs>;
  comparableProps: Record<string, unknown> | null;
  knownKeys: Set<string>;
  queue: ReactPropUpdate[];
  renderReady: boolean;
  draining: boolean;
  active: boolean;
}

/** Prevents a completed or failed instance from retaining further prop work. @internal */
function deactivatePropSyncState<
  P extends Record<string, unknown>,
  X,
  I extends Record<string, unknown>,
  SchemaInputs extends Record<string, unknown>,
>(state: ReactPropSyncState<P, X, I, SchemaInputs>): void {
  state.active = false;
  state.queue.length = 0;
}

/** Creates a shallow, stable snapshot of the component props for one React commit. @internal */
function snapshotProps(
  props: Record<string, unknown>
): Record<string, unknown> {
  return { ...props };
}

/**
 * Builds a self-contained update payload, resetting every previously observed missing key.
 * @internal
 */
function buildPropUpdate(
  desired: Record<string, unknown>,
  knownKeys: Set<string>
): ReactPropUpdate {
  const payload = snapshotProps(desired);

  for (const key of Object.keys(desired)) {
    knownKeys.add(key);
  }

  for (const key of knownKeys) {
    if (!Object.prototype.hasOwnProperty.call(desired, key)) {
      payload[key] = PROP_RESET;
    }
  }

  return {
    desired,
    payload,
    retryOnFailure: false,
  };
}

/**
 * Configuration options for creating a React driver.
 *
 * @remarks
 * The React instance must be provided to avoid bundling React with the driver.
 * This allows the driver to work with any version of React that implements
 * the required hooks and methods.
 *
 * @public
 */
export interface ReactDriverOptions<E = unknown> {
  /**
   * The React library instance to use for component creation.
   *
   * @remarks
   * Must provide `createElement`, `useRef`, `useEffect`, `useState`, and `forwardRef`.
   * Compatible with React 16.8+ and Preact with compat.
   */
  React: ReactLike<E>;
}

/**
 * Type definition for a React component created by the integration.
 *
 * @typeParam P - The props type for the component
 *
 * @remarks
 * This interface represents the callable component function returned by
 * {@link createReactComponent}. It includes an optional `displayName` for
 * React DevTools integration.
 *
 * @public
 */
export interface ReactComponentType<P, E = unknown> {
  /**
   * Renders the component with the given props.
   *
   * @param props - The component props
   * @returns A React element (type varies by React version)
   */
  (props: P): E;

  /**
   * Display name shown in React DevTools.
   *
   * @remarks
   * Automatically set to `ForgeFrame(ComponentName)` by the driver.
   */
  displayName?: string;
}

/**
 * Creates a React component wrapper for a ForgeFrame cross-domain component.
 *
 * @typeParam P - The props type defined in the ForgeFrame component
 * @typeParam X - The export type for data shared from the host component
 *
 * @param Component - The ForgeFrame component to wrap
 * @param options - Configuration options including the React instance
 * @typeParam P - The canonical props type defined by the ForgeFrame component
 * @typeParam X - The export type for data shared from the host component
 * @typeParam E - The React element return type
 * @typeParam I - An alternate consumer input shape, such as legacy alias keys
 * @typeParam RequireProps - Whether the wrapped factory requires props
 * @typeParam SchemaInputs - Canonical values accepted by each prop schema
 *
 * @returns A React component that renders the ForgeFrame component
 *
 * @remarks
 * This function bridges ForgeFrame's cross-domain component system with React's
 * component model. The returned component handles:
 * - Mounting and unmounting lifecycle
 * - Prop synchronization with the cross-domain component
 * - Error boundary integration via the `onError` callback
 * - Ref forwarding to the container element
 *
 * The component automatically cleans up the cross-domain connection when unmounted.
 *
 * @example
 * ```tsx
 * import React from 'react';
 * import ForgeFrame, { prop, createReactComponent } from 'forgeframe';
 *
 * const LoginComponent = ForgeFrame.create({
 *   tag: 'login-component',
 *   url: 'https://example.com/login',
 *   props: {
 *     onLogin: prop.function<(user: { id: string }) => void>(),
 *   },
 * });
 *
 * const LoginReact = createReactComponent(LoginComponent, { React });
 *
 * // Usage in JSX:
 * <LoginReact onLogin={(user) => console.log(user)} />
 * ```
 *
 * @public
 */
export function createReactComponent<
  P extends Record<string, unknown>,
  X = unknown,
  E = unknown,
  I extends Record<string, unknown> = P,
  RequireProps extends boolean = false,
  SchemaInputs extends Record<string, unknown> = I,
>(
  Component: ForgeFrameComponent<P, X, I, RequireProps, SchemaInputs>,
  options: ReactDriverOptions<E>
): ReactComponentType<
  FullReactComponentProps<P, I, RequireProps, SchemaInputs>,
  E
> {
  const { createElement, useRef, useEffect, useState, forwardRef } =
    options.React as unknown as ReactRuntime<E>;
  const createInstance = Component as unknown as (
    props: ConsumerPropsInput<P, I, SchemaInputs>
  ) => ForgeFrameComponentInstance<P, X, I, SchemaInputs>;

  const ReactComponent = forwardRef<
    HTMLDivElement,
    FullReactComponentProps<P, I, RequireProps, SchemaInputs>
  >(
    function ForgeFrameComponent(props, ref) {
      const {
        onRendered,
        onError,
        onClose,
        context,
        className,
        style,
        ...componentProps
      } = props;

      const containerRef = useRef<HTMLDivElement>(null);
      const instanceRef = useRef<
        ForgeFrameComponentInstance<P, X, I, SchemaInputs> | null
      >(null);
      const propSyncRef = useRef<
        ReactPropSyncState<P, X, I, SchemaInputs> | null
      >(null);
      const onRenderedRef = useRef<typeof onRendered>(onRendered);
      const onErrorRef = useRef<typeof onError>(onError);
      const onCloseRef = useRef<typeof onClose>(onClose);
      const [error, setError] = useState<Error | null>(null);

      const isCurrentSyncState = (
        state: ReactPropSyncState<P, X, I, SchemaInputs>
      ): boolean =>
        state.active &&
        instanceRef.current === state.instance &&
        propSyncRef.current === state;

      const drainPropUpdates = async (
        state: ReactPropSyncState<P, X, I, SchemaInputs>
      ): Promise<void> => {
        if (state.draining || !state.renderReady || !isCurrentSyncState(state)) {
          return;
        }

        state.draining = true;

        try {
          while (state.queue.length > 0 && isCurrentSyncState(state)) {
            const update = state.queue[0];
            if (!update) {
              return;
            }

            try {
              await state.instance.updateProps(
                update.payload as ConsumerPropsUpdate<P, I, SchemaInputs>
              );
            } catch (err) {
              if (!isCurrentSyncState(state)) {
                return;
              }

              state.queue.shift();
              if (update.retryOnFailure) {
                state.queue.unshift({
                  ...update,
                  retryOnFailure: false,
                });
              }
              state.comparableProps = null;
              reportReactError(onErrorRef.current ?? undefined, err as Error);
              continue;
            }

            if (!isCurrentSyncState(state)) {
              return;
            }

            state.queue.shift();
            state.comparableProps = update.desired;
          }
        } finally {
          state.draining = false;
        }
      };

      useEffect(() => {
        onRenderedRef.current = onRendered;
        onErrorRef.current = onError;
        onCloseRef.current = onClose;
      }, [onRendered, onError, onClose]);

      useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        setError(null);

        const initialProps = snapshotProps(
          componentProps as Record<string, unknown>
        );
        let instance: ForgeFrameComponentInstance<P, X, I, SchemaInputs>;
        try {
          instance = createInstance(
            initialProps as ConsumerPropsInput<P, I, SchemaInputs>
          );
        } catch (err) {
          const constructionError = err instanceof Error ? err : new Error(String(err));
          setError(constructionError);
          reportReactError(onErrorRef.current ?? undefined, constructionError);
          return;
        }
        const syncState: ReactPropSyncState<P, X, I, SchemaInputs> = {
          instance,
          comparableProps: initialProps,
          knownKeys: new Set(Object.keys(initialProps)),
          queue: [],
          renderReady: false,
          draining: false,
          active: true,
        };

        instanceRef.current = instance;
        propSyncRef.current = syncState;

        const unsubscribeRendered = instance.event.once('rendered', () => {
          return onRenderedRef.current?.();
        });
        const unsubscribeClose = instance.event.once('close', () => {
          deactivatePropSyncState(syncState);
          return onCloseRef.current?.();
        });
        const unsubscribeError = instance.event.on('error', (err: Error) => {
          reportReactError(onErrorRef.current ?? undefined, err);
        });

        instance.render(container, context).then(
          () => {
            if (!isCurrentSyncState(syncState)) {
              return;
            }

            syncState.renderReady = true;
            void drainPropUpdates(syncState);
          },
          (err: Error) => {
            if (!isCurrentSyncState(syncState)) {
              return;
            }

            deactivatePropSyncState(syncState);
            setError(err);
            reportReactError(onErrorRef.current ?? undefined, err);
          }
        );

        return () => {
          deactivatePropSyncState(syncState);
          instance.close().catch(() => undefined);
          unsubscribeRendered();
          unsubscribeClose();
          unsubscribeError();

          if (instanceRef.current === instance) {
            instanceRef.current = null;
          }
          if (propSyncRef.current === syncState) {
            propSyncRef.current = null;
          }
        };
      }, [context]);

      useEffect(() => {
        const syncState = propSyncRef.current;
        if (!syncState || !isCurrentSyncState(syncState)) return;

        const nextProps = snapshotProps(
          componentProps as Record<string, unknown>
        );
        const pendingUpdate = syncState.queue.at(-1);
        const prevProps = pendingUpdate?.desired ?? syncState.comparableProps;
        const nextPropsRecord = nextProps as Record<string, unknown>;
        if (
          prevProps &&
          shallowEqualProps(prevProps as Record<string, unknown>, nextPropsRecord)
        ) {
          if (pendingUpdate) {
            pendingUpdate.retryOnFailure = true;
          }
          return;
        }

        syncState.queue.push(buildPropUpdate(nextProps, syncState.knownKeys));
        void drainPropUpdates(syncState);
      });

      useEffect(() => {
        const container = containerRef.current;

        if (typeof ref === 'function') {
          ref(container);
          return () => {
            ref(null);
          };
        }

        if (ref && typeof ref === 'object') {
          ref.current = container;
          return () => {
            ref.current = null;
          };
        }
      }, [ref]);

      return createElement(
        'div',
        {
          ref: containerRef,
          className,
          style: error
            ? { color: 'red', padding: '16px', ...style }
            : { display: 'inline-block', ...style },
        },
        // Keep error content in its own node so recovery cannot clear an iframe
        // inserted into this container by the new instance's render call.
        error ? createElement('span', null, `Error: ${error.message}`) : null
      );
    }
  );

  const displayName = `ForgeFrame(${(Component as { name?: string }).name || 'Component'})`;
  ReactComponent.displayName = displayName;

  return ReactComponent;
}

/**
 * Creates a curried React component factory with a pre-configured React instance.
 *
 * @param React - The React library instance to use for all created components
 *
 * @returns A function that creates React wrappers for ForgeFrame components
 *
 * @remarks
 * This is a higher-order function that simplifies creating multiple React components
 * with the same React instance. It returns a factory that can be reused
 * across multiple ForgeFrame components.
 *
 * This pattern is useful when you have many ForgeFrame components and want to
 * avoid passing the React instance repeatedly.
 *
 * @example
 * ```tsx
 * import React from 'react';
 * import ForgeFrame, { withReactComponent } from 'forgeframe';
 *
 * // Create a reusable component factory
 * const createComponent = withReactComponent(React);
 *
 * // Create multiple React components using the same factory
 * const LoginComponent = ForgeFrame.create({ tag: 'login', url: '...' });
 * const ProfileComponent = ForgeFrame.create({ tag: 'profile', url: '...' });
 *
 * const LoginReact = createComponent(LoginComponent);
 * const ProfileReact = createComponent(ProfileComponent);
 * ```
 *
 * @public
 */
export function withReactComponent<E>(React: ReactLike<E>) {
  /**
   * Factory function that wraps a ForgeFrame component as a React component.
   *
   * @typeParam P - The props type defined in the ForgeFrame component
   * @typeParam X - The export type for data shared from the host component
   * @typeParam I - An alternate consumer input shape, such as legacy alias keys
   * @typeParam RequireProps - Whether the wrapped factory requires props
   * @typeParam SchemaInputs - Canonical values accepted by each prop schema
   *
   * @param Component - The ForgeFrame component to wrap
   * @returns A React component that renders the ForgeFrame component
   *
   * @internal
   */
  return function createComponent<
    P extends Record<string, unknown>,
    X = unknown,
    I extends Record<string, unknown> = P,
    RequireProps extends boolean = false,
    SchemaInputs extends Record<string, unknown> = I,
  >(
    Component: ForgeFrameComponent<P, X, I, RequireProps, SchemaInputs>
  ): ReactComponentType<
    FullReactComponentProps<P, I, RequireProps, SchemaInputs>,
    E
  > {
    return createReactComponent(Component, { React });
  };
}

export default createReactComponent;
