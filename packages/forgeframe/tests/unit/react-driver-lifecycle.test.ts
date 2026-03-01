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
  const event = {
    once: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    removeAllListeners: vi.fn(),
  };

  const instance = {
    render: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    updateProps: vi.fn().mockResolvedValue(undefined),
    event,
  };

  const component = vi.fn().mockReturnValue(instance);
  Object.defineProperty(component, 'name', { value: 'LifecycleComponent' });

  return { component, instance, event };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createReactComponent lifecycle integration', () => {
  it('should mount, register lifecycle listeners, and cleanup instance', async () => {
    const { React, refs, effects } = createReactHarness();
    const { component, instance, event } = createForgeFrameComponentMock();
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
    expect(event.once).toHaveBeenCalledWith('rendered', onRendered);
    expect(event.once).toHaveBeenCalledWith('close', onClose);
    expect(event.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(instance.render).toHaveBeenCalledWith(container, 'popup');

    (cleanup as (() => void) | undefined)?.();
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

  it('should sync changed props and skip unchanged shallow-equal updates', () => {
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

    expect(instance.updateProps).toHaveBeenCalledTimes(1);
    expect(instance.updateProps).toHaveBeenCalledWith({ amount: 1 });

    ReactComponent({ amount: 2, onError });
    effects[0]?.(); // onError ref sync
    effects[2]?.(); // changed props

    expect(instance.updateProps).toHaveBeenCalledTimes(2);
    expect(instance.updateProps).toHaveBeenLastCalledWith({ amount: 2 });
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
