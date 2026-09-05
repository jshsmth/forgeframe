/**
 * Shared deterministic hook and component mocks for React driver tests.
 */
import { vi } from "vitest";

export function createReactHarness() {
	const refs: Array<{ current: unknown }> = [];
	// biome-ignore lint/suspicious/noConfusingVoidType: React effects may return nothing or a cleanup callback; retain the React-compatible signature.
	const effects: Array<() => void | (() => void)> = [];
	let hookIndex = 0;
	const setState = vi.fn();

	const React = {
		createElement: vi.fn((type, props, ...children) => ({
			type,
			props: { ...props, children },
		})),
		useRef: vi.fn((initial) => {
			const index = hookIndex++;
			if (!refs[index]) {
				refs[index] = { current: initial };
			}
			return refs[index];
		}),
		useEffect: vi.fn((effect) => {
			effects.push(effect);
		}),
		useState: vi.fn((initial) => [initial, setState]),
		forwardRef: vi.fn((render) => {
			return (
				props: Record<string, unknown>,
				ref: { current: unknown } | null = null,
			) => {
				hookIndex = 0;
				effects.length = 0;
				return render(props, ref);
			};
		}),
	};

	return { React, refs, effects, setState };
}

export function createDeferredPromise<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}

export async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

/** Creates a mock ForgeFrame component and instance with event emitter stubs. */
export function createForgeFrameComponentMock() {
	const handlers: {
		rendered?: () => void;
		close?: () => void;
		error?: (err: Error) => void;
	} = {};
	const unsubscribes = {
		rendered: vi.fn(() => {
			handlers.rendered = undefined;
		}),
		close: vi.fn(() => {
			handlers.close = undefined;
		}),
		error: vi.fn(() => {
			handlers.error = undefined;
		}),
	};
	const event = {
		once: vi.fn((name: string, handler: () => void) => {
			if (name === "rendered") {
				handlers.rendered = handler;
				return unsubscribes.rendered;
			}

			if (name === "close") {
				handlers.close = handler;
				return unsubscribes.close;
			}

			return vi.fn();
		}),
		on: vi.fn((name: string, handler: (err: Error) => void) => {
			if (name === "error") {
				handlers.error = handler;
				return unsubscribes.error;
			}

			return vi.fn();
		}),
		off: vi.fn(),
		emit: vi.fn(),
		removeAllListeners: vi.fn(),
	};

	const instance = {
		render: vi.fn().mockResolvedValue(undefined),
		close: vi.fn().mockImplementation(async () => {
			handlers.close?.();
		}),
		updateProps: vi
			.fn<(props: Record<string, unknown>) => Promise<void>>()
			.mockResolvedValue(undefined),
		event,
	};

	const component = vi.fn().mockReturnValue(instance);
	Object.defineProperty(component, "name", { value: "LifecycleComponent" });

	return { component, instance, event, handlers, unsubscribes };
}
