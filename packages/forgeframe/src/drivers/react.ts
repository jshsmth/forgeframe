import {
	type CSSProperties,
	createElement,
	type ForwardRefExoticComponent,
	forwardRef,
	type ReactElement,
	type Ref,
	type RefAttributes,
	useEffect,
	useRef,
	useState,
} from "react";
import type { ContextType } from "../constants";
import { getComponentOptions } from "../core/component-registry";
import { ForgeFrameError } from "../errors";
import type {
	AnyComponent,
	ComponentInstance,
	ExportsOf,
	InputOf,
} from "../types/runtime";
import { hasOwnDeclaredField } from "../utils/own-field";
import {
	assignRef,
	callReactCallback,
	createMountState,
	isCurrentSyncState,
	isHeldUpdateCancellation,
	mountReactInstance,
	type ReactInstance,
	type ReactMountState,
	retargetHandle,
} from "./react/lifecycle";
import {
	drainPropUpdates,
	enqueuePropSnapshot,
	snapshotProps,
} from "./react/prop-sync";

/**
 * Props every wrapper from {@link createReactComponent} accepts, besides the
 * component's own props.
 *
 * @remarks
 * These names are reserved: a component whose definition declares one of them
 * is rejected by {@link createReactComponent}. The wrapper also accepts a
 * `ref`, which receives the container `div`.
 *
 * @typeParam Exports - What the host exports; types the `instanceRef` handle
 *
 * @public
 */
export interface ReactComponentProps<Exports = unknown> {
	/**
	 * Called after the instance has rendered, right after `instanceRef`
	 * receives the handle.
	 */
	onRendered?: () => void;

	/**
	 * Called with each error: a failed render or prop update, or an error the
	 * host reports.
	 *
	 * @remarks
	 * Library failures are `ForgeFrameError`s; branch on `error.code`, such as
	 * `POPUP_BLOCKED` or `INIT_TIMEOUT`. Errors the host reports with
	 * `reportError()` arrive as plain `Error`s.
	 */
	onError?: (error: Error) => void;

	/**
	 * Called when the instance closes: the host closes it, the user closes its
	 * popup, `instanceRef.current.close()` is called, or the wrapper unmounts or
	 * changes `context`. `instanceRef` is cleared just before it runs.
	 */
	onClose?: () => void;

	/**
	 * Renders in an iframe or a popup. Defaults to the component's `context`
	 * option. Changing it closes the instance and renders a new one.
	 */
	context?: ContextType;

	/**
	 * Receives a handle to the rendered instance once `render()` resolves, and
	 * `null` when that instance closes, the wrapper unmounts, `context`
	 * changes, or rendering fails. Accepts a ref object or a callback ref.
	 */
	instanceRef?: Ref<ReactInstance<Exports>>;

	/** CSS class name of the container `div`. */
	className?: string;

	/**
	 * Inline styles of the container `div`, merged over its default
	 * `display: inline-block`.
	 */
	style?: CSSProperties;
}

/**
 * The React component {@link createReactComponent} returns for a component.
 *
 * @remarks
 * Its props are the component's factory input, with requiredness kept, plus
 * {@link ReactComponentProps} and a `ref` to the container `div`.
 *
 * @typeParam C - The wrapped component, as `typeof Component`
 *
 * @example
 * ```typescript
 * const LoginReact: ReactComponentOf<typeof LoginComponent> =
 *   createReactComponent(LoginComponent);
 * ```
 *
 * @public
 */
export type ReactComponentOf<C extends AnyComponent> =
	ForwardRefExoticComponent<
		InputOf<C> &
			ReactComponentProps<ExportsOf<C>> &
			RefAttributes<HTMLDivElement>
	>;

export type { ReactInstance };

/**
 * Props consumed by the wrapper or by React, never forwarded to the
 * component. React keeps `key` and `ref` out of the props it passes.
 */
const RESERVED_WRAPPER_PROPS = [
	"onRendered",
	"onError",
	"onClose",
	"context",
	"instanceRef",
	"className",
	"style",
	"ref",
	"key",
] as const satisfies readonly (keyof ReactComponentProps | "ref" | "key")[];

const RESERVED_WRAPPER_PROP_NAMES: ReadonlySet<string> = new Set(
	RESERVED_WRAPPER_PROPS,
);

/** All props the wrapper body receives. @internal */
type WrapperProps = Record<string, unknown> & ReactComponentProps;

/** Attaches the container element and forwards it to one forwarded ref. @internal */
type ContainerRefCallback = (
	node: HTMLDivElement | null,
) => (() => void) | undefined;

/**
 * Checks a `createReactComponent` call and returns the wrapped component's tag.
 *
 * @throws {@link ForgeFrameError} `VALIDATION` for a v1 second argument, a value
 * that is not a ForgeFrame component, or a reserved wrapper prop name in the
 * component's definitions
 * @internal
 */
function assertReactComponentArguments(
	Component: unknown,
	extraArguments: readonly unknown[],
): string {
	if (extraArguments.length > 0) {
		throw new ForgeFrameError(
			"VALIDATION",
			"createReactComponent() takes only the component. React now comes from the `react` peer dependency, so remove the second argument (the v1 `{ React }` option).",
		);
	}
	const options =
		typeof Component === "function"
			? getComponentOptions(Component)
			: undefined;
	if (!options) {
		throw new ForgeFrameError(
			"VALIDATION",
			"createReactComponent() expects a component returned by create().",
		);
	}
	const reserved = RESERVED_WRAPPER_PROPS.filter((name) =>
		hasOwnDeclaredField(options.props ?? {}, name),
	);
	if (reserved.length > 0) {
		throw new ForgeFrameError(
			"VALIDATION",
			`Component "${options.tag}" declares ${reserved.map((name) => `"${name}"`).join(", ")}, which the React wrapper reserves for itself. Rename the prop (for example "onHostClose").`,
		);
	}
	return options.tag;
}

/**
 * Splits the wrapper's own props from the props it forwards to the component,
 * by the one list of reserved names.
 * @internal
 */
function splitWrapperProps(props: WrapperProps): {
	wrapperProps: ReactComponentProps;
	componentProps: Record<string, unknown>;
} {
	const wrapperProps: Record<string, unknown> = {};
	const componentProps: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(props)) {
		(RESERVED_WRAPPER_PROP_NAMES.has(key) ? wrapperProps : componentProps)[
			key
		] = value;
	}
	return { wrapperProps: wrapperProps as ReactComponentProps, componentProps };
}

/**
 * The container `div`'s props: the error presentation while an error is
 * shown, otherwise the default inline-block layout. The caller's `style`
 * wins over both.
 * @internal
 */
function containerElementProps(
	error: Error | null,
	className: string | undefined,
	style: CSSProperties | undefined,
): { className: string | undefined; style: CSSProperties } {
	return {
		className,
		style: error
			? { color: "red", padding: "16px", ...style }
			: { display: "inline-block", ...style },
	};
}

/**
 * Returns one stable container callback per forwarded ref. Memoizing by ref,
 * rather than keeping only the latest, means a render React discards cannot
 * replace the callback of a ref it already committed.
 * @internal
 */
function createContainerRefCache(containerRef: {
	current: HTMLDivElement | null;
}): (ref: Ref<HTMLDivElement> | undefined) => ContainerRefCallback {
	const byRef = new WeakMap<object, ContainerRefCallback>();
	let withoutRef: ContainerRefCallback | undefined;
	return (ref) => {
		if (!ref) {
			withoutRef ??= createContainerRef(containerRef, undefined);
			return withoutRef;
		}
		let callback = byRef.get(ref);
		if (!callback) {
			callback = createContainerRef(containerRef, ref);
			byRef.set(ref, callback);
		}
		return callback;
	};
}

/**
 * Creates the container's callback ref, which records the element and forwards
 * it during React's commit phase, before layout effects run. A forwarded
 * callback's React 19 cleanup runs on detach in place of a `null` call.
 * @internal
 */
function createContainerRef(
	containerRef: { current: HTMLDivElement | null },
	ref: Ref<HTMLDivElement> | undefined,
): ContainerRefCallback {
	return (node) => {
		containerRef.current = node;
		const cleanup = assignRef(ref, node);
		if (!cleanup) return undefined;
		return () => {
			containerRef.current = null;
			cleanup();
		};
	};
}

/** Reports an error to `onError` without letting its failure break lifecycle work. @internal */
function reportReactError(
	callback: ((error: Error) => void) | undefined,
	error: Error,
): void {
	if (callback) callReactCallback("onError", () => callback(error));
}

/**
 * Wraps a ForgeFrame component as a React component.
 *
 * @param Component - The component returned by `create()`
 * @typeParam C - The wrapped component; its factory input types the wrapper's
 * props, and its exports type the `instanceRef` handle
 * @returns A React component that renders `Component` in its container `div`
 * @throws {@link ForgeFrameError} `VALIDATION` when `Component` is not a
 * ForgeFrame component, when a second argument is passed (the v1 `{ React }`
 * option), or when the component declares a prop the wrapper reserves
 *
 * @remarks
 * The wrapper creates and renders an instance when it mounts and closes it
 * when it unmounts. Committed prop changes are sent in order with
 * `updateProps()`; removing a prop resets it as `updateProps({ key: undefined })`
 * does, and passing `undefined` counts as leaving the prop out. Changing
 * `context` closes the instance and renders a new one.
 *
 * The forwarded `ref` is the container `div`, attached during commit, before a
 * parent's layout effects run; React 19 ref cleanups are honored. `instanceRef`
 * receives the rendered instance; see {@link ReactComponentProps.instanceRef}.
 * A failed render shows its message inside the container and calls `onError`.
 *
 * React DevTools shows the wrapper as `ForgeFrame(<tag>)`. On the server the
 * wrapper renders only its container; effects do not run, so no instance is
 * created. Use it inside a client component in React Server Components
 * frameworks.
 *
 * @example
 * ```tsx
 * import { create, prop } from 'forgeframe';
 * import { createReactComponent } from 'forgeframe/react';
 *
 * const LoginComponent = create({
 *   tag: 'login-component',
 *   url: 'https://auth.example.com/login',
 *   props: {
 *     onLogin: prop.function<(user: { id: string }) => void>(),
 *   },
 * });
 *
 * const LoginReact = createReactComponent(LoginComponent);
 *
 * <LoginReact onLogin={(user) => console.log(user)} />;
 * ```
 *
 * @public
 */
export function createReactComponent<C extends AnyComponent>(
	Component: C,
): ReactComponentOf<C>;
export function createReactComponent(
	Component: AnyComponent,
	...extraArguments: unknown[]
): ReactComponentOf<AnyComponent> {
	const tag = assertReactComponentArguments(Component, extraArguments);
	const createInstance = Component as unknown as (
		props: Record<string, unknown>,
	) => ComponentInstance;

	const ReactComponent = forwardRef<HTMLDivElement, WrapperProps>(
		function ForgeFrameComponent(props, ref): ReactElement {
			const { wrapperProps, componentProps } = splitWrapperProps(props);
			const { onRendered, onError, onClose, context, instanceRef } =
				wrapperProps;

			const containerRef = useRef<HTMLDivElement | null>(null);
			const mountStateRef = useRef<ReactMountState>(null);
			const onRenderedRef = useRef(onRendered);
			const onErrorRef = useRef(onError);
			const onCloseRef = useRef(onClose);
			const containerRefCache =
				useRef<ReturnType<typeof createContainerRefCache>>(null);
			const [error, setError] = useState<Error | null>(null);
			// Lazily created once; React re-attaches only when the forwarded ref changes.
			containerRefCache.current ??= createContainerRefCache(containerRef);
			const attachContainer = containerRefCache.current(ref);
			mountStateRef.current ??= createMountState(instanceRef);
			const mountState = mountStateRef.current;

			useEffect(() => {
				onRenderedRef.current = onRendered;
				onErrorRef.current = onError;
				onCloseRef.current = onClose;
			}, [onRendered, onError, onClose]);

			// biome-ignore lint/correctness/useExhaustiveDependencies: an instance mounts with its first committed props and remounts only for a new context; later props sync through the queue, and mountState is created once.
			useEffect(() => {
				const container = containerRef.current;
				if (!container) return;

				setError(null);
				return mountReactInstance(
					createInstance,
					snapshotProps(componentProps),
					container,
					context,
					mountState,
					{
						onRendered: () => onRenderedRef.current?.(),
						onClose: () => onCloseRef.current?.(),
						onError: (err) => reportReactError(onErrorRef.current, err),
						setError,
					},
				);
			}, [context]);

			// biome-ignore lint/correctness/useExhaustiveDependencies: mountState is created once per wrapper and never replaced.
			useEffect(() => {
				retargetHandle(mountState, instanceRef);
			}, [instanceRef]);

			useEffect(() => {
				const state = mountState.syncState;
				if (!state || !isCurrentSyncState(state, mountState)) return;
				if (enqueuePropSnapshot(state, snapshotProps(componentProps))) {
					void drainPropUpdates(
						state,
						(candidate) => isCurrentSyncState(candidate, mountState),
						(err) => {
							if (!isHeldUpdateCancellation(err))
								reportReactError(onErrorRef.current, err);
						},
					);
				}
			});

			return createElement(
				"div",
				{
					ref: attachContainer,
					...containerElementProps(
						error,
						wrapperProps.className,
						wrapperProps.style,
					),
				},
				// Keep error content in its own node so recovery cannot clear an iframe
				// inserted into this container by the new instance's render call.
				error ? createElement("span", null, `Error: ${error.message}`) : null,
			);
		},
	);

	ReactComponent.displayName = `ForgeFrame(${tag})`;

	return ReactComponent as unknown as ReactComponentOf<AnyComponent>;
}
