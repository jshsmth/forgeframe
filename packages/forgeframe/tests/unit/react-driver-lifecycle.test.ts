/**
 * Lifecycle integration tests for `createReactComponent` in `@/drivers/react`.
 *
 * Covers mount/unmount flows, listener cleanup, prop synchronization guards, error propagation, and forwarded ref wiring.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReactComponent } from '@/drivers/react';

/**
 * Builds a minimal React-like hook harness for deterministic lifecycle assertions.
 */
function createReactHarness() {
  const refs: Array<{ current: unknown }> = [];
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
      return (props: Record<string, unknown>, ref: { current: unknown } | null = null) => {
        hookIndex = 0;
        effects.length = 0;
        return render(props, ref);
      };
    }),
  };

  return { React, refs, effects, setState };
}

/**
 * Creates a mock ForgeFrame component factory and instance with event emitter stubs.
 */
function createForgeFrameComponentMock() {
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
      if (name === 'rendered') {
        handlers.rendered = handler;
        return unsubscribes.rendered;
      }

      if (name === 'close') {
        handlers.close = handler;
        return unsubscribes.close;
      }

      return vi.fn();
    }),
    on: vi.fn((name: string, handler: (err: Error) => void) => {
      if (name === 'error') {
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
    updateProps: vi.fn().mockResolvedValue(undefined),
    event,
  };

  const component = vi.fn().mockReturnValue(instance);
  Object.defineProperty(component, 'name', { value: 'LifecycleComponent' });

  return { component, instance, event, handlers, unsubscribes };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createReactComponent lifecycle integration', () => {
  it('should mount, register lifecycle listeners, and cleanup instance', async () => {
    const { React, refs, effects } = createReactHarness();
    const { component, instance, event, unsubscribes } = createForgeFrameComponentMock();
    const onRendered = vi.fn();
    const onClose = vi.fn();
    const onError = vi.fn();

    const ReactComponent = createReactComponent(component as never, { React: React as never });
    ReactComponent({
      amount: 10,
      context: 'popup',
      onRendered,
      onClose,
      onError,
    });

    const container = document.createElement('div');
    refs[0].current = container;

    effects[0]?.(); // onError ref sync
    const cleanup = effects[1]?.(); // mount

    expect(component).toHaveBeenCalledWith({ amount: 10 });
    expect(event.once).toHaveBeenCalledWith('rendered', expect.any(Function));
    expect(event.once).toHaveBeenCalledWith('close', expect.any(Function));
    expect(event.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(instance.render).toHaveBeenCalledWith(container, 'popup');

    (cleanup as (() => void) | undefined)?.();
    expect(unsubscribes.rendered).toHaveBeenCalledTimes(1);
    expect(unsubscribes.close).toHaveBeenCalledTimes(1);
    expect(unsubscribes.error).toHaveBeenCalledTimes(1);
    expect(instance.close).toHaveBeenCalledTimes(1);
  });

  it('should skip mount work when container ref is unavailable', () => {
    const { React, effects } = createReactHarness();
    const { component } = createForgeFrameComponentMock();

    const ReactComponent = createReactComponent(component as never, { React: React as never });
    ReactComponent({ amount: 10 });

    effects[0]?.(); // onError ref sync
    const cleanup = effects[1]?.(); // mount

    expect(cleanup).toBeUndefined();
    expect(component).not.toHaveBeenCalled();
  });

  it('should skip the initial prop sync and only update when props change', () => {
    const { React, refs, effects } = createReactHarness();
    const { component, instance } = createForgeFrameComponentMock();
    const onError = vi.fn();

    const ReactComponent = createReactComponent(component as never, { React: React as never });

    ReactComponent({ amount: 1, onError });
    refs[0].current = document.createElement('div');
    effects[0]?.(); // onError ref sync
    effects[1]?.(); // mount
    effects[2]?.(); // initial prop sync
    effects[2]?.(); // same props, should no-op

    expect(instance.updateProps).not.toHaveBeenCalled();

    ReactComponent({ amount: 2, onError });
    effects[0]?.(); // onError ref sync
    effects[2]?.(); // changed props

    expect(instance.updateProps).toHaveBeenCalledTimes(1);
    expect(instance.updateProps).toHaveBeenCalledWith({ amount: 2 });
  });

  it('should forward updateProps failures to onError callback', async () => {
    const { React, refs, effects } = createReactHarness();
    const { component, instance } = createForgeFrameComponentMock();
    const onError = vi.fn();
    const updateError = new Error('update failed');
    instance.updateProps.mockRejectedValueOnce(updateError);

    const ReactComponent = createReactComponent(component as never, { React: React as never });
    ReactComponent({ amount: 1, onError });
    refs[0].current = document.createElement('div');
    effects[0]?.(); // onError ref sync
    effects[1]?.(); // mount

    ReactComponent({ amount: 2, onError });
    effects[0]?.(); // onError ref sync
    effects[2]?.(); // prop sync with changed value
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(updateError);
  });

  it('should remount the ForgeFrame instance when context changes', () => {
    const { React, refs, effects } = createReactHarness();
    const first = createForgeFrameComponentMock();
    const second = createForgeFrameComponentMock();
    const component = vi
      .fn()
      .mockReturnValueOnce(first.instance)
      .mockReturnValueOnce(second.instance);
    Object.defineProperty(component, 'name', { value: 'LifecycleComponent' });
    const container = document.createElement('div');

    const ReactComponent = createReactComponent(component as never, { React: React as never });

    ReactComponent({ amount: 1, context: 'popup' });
    refs[0].current = container;
    effects[0]?.();
    const firstCleanup = effects[1]?.();

    ReactComponent({ amount: 1, context: 'iframe' });
    refs[0].current = container;
    effects[0]?.();
    (firstCleanup as (() => void) | undefined)?.();
    const secondCleanup = effects[1]?.();
    effects[2]?.();

    expect(component).toHaveBeenCalledTimes(2);
    expect(first.instance.render).toHaveBeenCalledWith(container, 'popup');
    expect(first.unsubscribes.rendered).toHaveBeenCalledTimes(1);
    expect(first.unsubscribes.close).toHaveBeenCalledTimes(1);
    expect(first.unsubscribes.error).toHaveBeenCalledTimes(1);
    expect(first.instance.close).toHaveBeenCalledTimes(1);
    expect(second.instance.render).toHaveBeenCalledWith(container, 'iframe');
    expect(second.instance.updateProps).not.toHaveBeenCalled();

    (secondCleanup as (() => void) | undefined)?.();
  });

  it('should invoke onClose during cleanup before unsubscribing the close listener', async () => {
    const { React, refs, effects } = createReactHarness();
    const { component, unsubscribes } = createForgeFrameComponentMock();
    const onClose = vi.fn();

    const ReactComponent = createReactComponent(component as never, { React: React as never });
    ReactComponent({ amount: 1, onClose });
    refs[0].current = document.createElement('div');
    effects[0]?.();
    const cleanup = effects[1]?.();

    await (cleanup as (() => Promise<void> | void) | undefined)?.();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(unsubscribes.close).toHaveBeenCalledTimes(1);
  });

  it('should call the latest onRendered callback when props change after mount', () => {
    const { React, refs, effects } = createReactHarness();
    const { component, event } = createForgeFrameComponentMock();
    const firstOnRendered = vi.fn();
    const secondOnRendered = vi.fn();

    const ReactComponent = createReactComponent(component as never, { React: React as never });
    ReactComponent({ amount: 1, onRendered: firstOnRendered });
    refs[0].current = document.createElement('div');
    effects[0]?.();
    effects[1]?.();

    const renderedHandler = event.once.mock.calls.find(([name]) => name === 'rendered')?.[1] as
      | (() => void)
      | undefined;

    ReactComponent({ amount: 1, onRendered: secondOnRendered });
    effects[0]?.();

    renderedHandler?.();

    expect(firstOnRendered).not.toHaveBeenCalled();
    expect(secondOnRendered).toHaveBeenCalledTimes(1);
    expect(event.once).toHaveBeenCalledTimes(2);
  });

  it('should call the latest onClose callback when props change after mount', () => {
    const { React, refs, effects } = createReactHarness();
    const { component, event } = createForgeFrameComponentMock();
    const firstOnClose = vi.fn();
    const secondOnClose = vi.fn();

    const ReactComponent = createReactComponent(component as never, { React: React as never });
    ReactComponent({ amount: 1, onClose: firstOnClose });
    refs[0].current = document.createElement('div');
    effects[0]?.();
    effects[1]?.();

    const closeHandler = event.once.mock.calls.find(([name]) => name === 'close')?.[1] as
      | (() => void)
      | undefined;

    ReactComponent({ amount: 1, onClose: secondOnClose });
    effects[0]?.();

    closeHandler?.();

    expect(firstOnClose).not.toHaveBeenCalled();
    expect(secondOnClose).toHaveBeenCalledTimes(1);
    expect(event.once).toHaveBeenCalledTimes(2);
  });

  it('should update props without remounting when non-structural props change', () => {
    const { React, refs, effects } = createReactHarness();
    const { component, instance } = createForgeFrameComponentMock();

    const ReactComponent = createReactComponent(component as never, { React: React as never });

    ReactComponent({ amount: 1, context: 'popup' });
    refs[0].current = document.createElement('div');
    effects[0]?.();
    effects[1]?.();
    effects[2]?.();

    ReactComponent({ amount: 2, context: 'popup' });
    effects[0]?.();
    effects[2]?.();

    expect(component).toHaveBeenCalledTimes(1);
    expect(instance.render).toHaveBeenCalledTimes(1);
    expect(instance.updateProps).toHaveBeenCalledTimes(1);
    expect(instance.updateProps).toHaveBeenCalledWith({ amount: 2 });
  });

  it('should set error state and invoke onError when initial render fails', async () => {
    const { React, refs, effects, setState } = createReactHarness();
    const { component, instance } = createForgeFrameComponentMock();
    const onError = vi.fn();
    const renderError = new Error('render failed');
    instance.render.mockRejectedValueOnce(renderError);

    const ReactComponent = createReactComponent(component as never, { React: React as never });
    ReactComponent({ amount: 1, onError });
    refs[0].current = document.createElement('div');
    effects[0]?.(); // onError ref sync
    effects[1]?.(); // mount
    await Promise.resolve();

    expect(setState).toHaveBeenCalledWith(renderError);
    expect(onError).toHaveBeenCalledWith(renderError);
  });

  it('should forward object refs to the container element', () => {
    const { React, refs, effects } = createReactHarness();
    const { component } = createForgeFrameComponentMock();
    const forwardedRef = { current: null as unknown };

    const ReactComponent = createReactComponent(component as never, { React: React as never });
    (
      ReactComponent as unknown as (
        props: Record<string, unknown>,
        ref: { current: unknown }
      ) => unknown
    )({ amount: 1 }, forwardedRef);

    const container = document.createElement('div');
    refs[0].current = container;
    effects[3]?.();

    expect(forwardedRef.current).toBe(container);
  });
});
