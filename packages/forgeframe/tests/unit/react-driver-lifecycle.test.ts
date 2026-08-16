/**
 * Lifecycle integration tests for `createReactComponent` in `@/drivers/react`.
 *
 * Covers mount/unmount flows, remount isolation, listener cleanup, error propagation,
 * and forwarded ref wiring.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReactComponent } from '@/drivers/react';
import {
  createDeferredPromise,
  createForgeFrameComponentMock,
  createReactHarness,
  flushMicrotasks,
} from './react-driver-test-harness';

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

  it('should ignore stale render rejections after context remounts', async () => {
    const { React, refs, effects, setState } = createReactHarness();
    const first = createForgeFrameComponentMock();
    const second = createForgeFrameComponentMock();
    const onError = vi.fn();
    const staleRenderError = new Error('stale render failed');
    const deferredRender = createDeferredPromise<void>();
    first.instance.render.mockReturnValueOnce(deferredRender.promise);

    const component = vi
      .fn()
      .mockReturnValueOnce(first.instance)
      .mockReturnValueOnce(second.instance);
    Object.defineProperty(component, 'name', { value: 'LifecycleComponent' });
    const container = document.createElement('div');

    const ReactComponent = createReactComponent(component as never, { React: React as never });

    ReactComponent({ amount: 1, context: 'popup', onError });
    refs[0].current = container;
    effects[0]?.();
    const firstCleanup = effects[1]?.();

    ReactComponent({ amount: 1, context: 'iframe', onError });
    refs[0].current = container;
    effects[0]?.();
    (firstCleanup as (() => void) | undefined)?.();
    effects[1]?.();

    deferredRender.reject(staleRenderError);
    await Promise.resolve();

    expect(first.instance.render).toHaveBeenCalledWith(container, 'popup');
    expect(second.instance.render).toHaveBeenCalledWith(container, 'iframe');
    expect(setState).not.toHaveBeenCalledWith(staleRenderError);
    expect(onError).not.toHaveBeenCalledWith(staleRenderError);
  });

  it('should ignore stale updateProps rejections after context remounts', async () => {
    const { React, refs, effects } = createReactHarness();
    const first = createForgeFrameComponentMock();
    const second = createForgeFrameComponentMock();
    const onError = vi.fn();
    const staleUpdateError = new Error('stale update failed');
    const deferredUpdate = createDeferredPromise<void>();
    first.instance.updateProps.mockReturnValueOnce(deferredUpdate.promise);

    const component = vi
      .fn()
      .mockReturnValueOnce(first.instance)
      .mockReturnValueOnce(second.instance);
    Object.defineProperty(component, 'name', { value: 'LifecycleComponent' });
    const container = document.createElement('div');

    const ReactComponent = createReactComponent(component as never, { React: React as never });

    ReactComponent({ amount: 1, context: 'popup', onError });
    refs[0].current = container;
    effects[0]?.();
    const firstCleanup = effects[1]?.();
    effects[2]?.();
    await flushMicrotasks();

    ReactComponent({ amount: 2, context: 'popup', onError });
    effects[0]?.();
    effects[2]?.();

    ReactComponent({ amount: 2, context: 'iframe', onError });
    refs[0].current = container;
    effects[0]?.();
    (firstCleanup as (() => void) | undefined)?.();
    effects[1]?.();
    effects[2]?.();

    deferredUpdate.reject(staleUpdateError);
    await flushMicrotasks();

    expect(first.instance.updateProps).toHaveBeenCalledWith({ amount: 2 });
    expect(second.instance.updateProps).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalledWith(staleUpdateError);
  });

  it('should not let a stale update completion advance a remounted instance', async () => {
    const { React, refs, effects } = createReactHarness();
    const first = createForgeFrameComponentMock();
    const second = createForgeFrameComponentMock();
    const deferredUpdate = createDeferredPromise<void>();
    first.instance.updateProps.mockReturnValueOnce(deferredUpdate.promise);

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
    effects[2]?.();
    await flushMicrotasks();

    ReactComponent({ amount: 2, context: 'popup' });
    effects[0]?.();
    effects[2]?.();
    expect(first.instance.updateProps).toHaveBeenCalledWith({ amount: 2 });

    ReactComponent({ amount: 10, context: 'iframe' });
    refs[0].current = container;
    effects[0]?.();
    (firstCleanup as (() => void) | undefined)?.();
    effects[1]?.();
    effects[2]?.();
    await flushMicrotasks();

    deferredUpdate.resolve();
    await flushMicrotasks();

    ReactComponent({ amount: 2, context: 'iframe' });
    effects[0]?.();
    effects[2]?.();
    await flushMicrotasks();

    expect(second.instance.updateProps).toHaveBeenCalledTimes(1);
    expect(second.instance.updateProps).toHaveBeenCalledWith({ amount: 2 });
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

  it('should not report an intentional close while the initial render is pending', async () => {
    const { React, refs, effects, setState } = createReactHarness();
    const { component, instance, handlers } = createForgeFrameComponentMock();
    const deferredRender = createDeferredPromise<void>();
    const onClose = vi.fn();
    const onError = vi.fn();
    const cancellationError = new Error(
      'Component "react-close-component" was closed before rendering completed'
    );
    instance.render.mockReturnValueOnce(deferredRender.promise);

    const ReactComponent = createReactComponent(component as never, {
      React: React as never,
    });
    ReactComponent({ amount: 1, onClose, onError });
    refs[0].current = document.createElement('div');
    effects[0]?.();
    effects[1]?.();

    deferredRender.reject(cancellationError);
    handlers.close?.();
    await flushMicrotasks();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(setState).not.toHaveBeenCalledWith(cancellationError);
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

  it('should update props without remounting when non-structural props change', async () => {
    const { React, refs, effects } = createReactHarness();
    const { component, instance } = createForgeFrameComponentMock();

    const ReactComponent = createReactComponent(component as never, { React: React as never });

    ReactComponent({ amount: 1, context: 'popup' });
    refs[0].current = document.createElement('div');
    effects[0]?.();
    effects[1]?.();
    effects[2]?.();
    await flushMicrotasks();

    ReactComponent({ amount: 2, context: 'popup' });
    effects[0]?.();
    effects[2]?.();
    await flushMicrotasks();

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

  it('should deactivate and clear prop sync after initial render fails', async () => {
    const { React, refs, effects } = createReactHarness();
    const { component, instance } = createForgeFrameComponentMock();
    const deferredRender = createDeferredPromise<void>();
    const renderError = new Error('render failed');
    instance.render.mockReturnValueOnce(deferredRender.promise);

    const ReactComponent = createReactComponent(component as never, { React: React as never });
    ReactComponent({ amount: 1 });
    refs[0].current = document.createElement('div');
    effects[0]?.();
    effects[1]?.();
    effects[2]?.();

    ReactComponent({ amount: 2 });
    effects[0]?.();
    effects[2]?.();

    const syncState = refs[2]?.current as {
      active: boolean;
      queue: unknown[];
      renderReady: boolean;
    };
    expect(syncState.active).toBe(true);
    expect(syncState.renderReady).toBe(false);
    expect(syncState.queue).toHaveLength(1);

    deferredRender.reject(renderError);
    await flushMicrotasks();

    expect(syncState.active).toBe(false);
    expect(syncState.queue).toHaveLength(0);

    ReactComponent({ amount: 3 });
    effects[0]?.();
    effects[2]?.();

    expect(syncState.queue).toHaveLength(0);
    expect(instance.updateProps).not.toHaveBeenCalled();
  });

  it('should clear prior render errors before remounting on context changes', async () => {
    const { React, refs, effects, setState } = createReactHarness();
    const first = createForgeFrameComponentMock();
    const second = createForgeFrameComponentMock();
    const renderError = new Error('render failed');
    first.instance.render.mockRejectedValueOnce(renderError);
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
    await Promise.resolve();

    ReactComponent({ amount: 1, context: 'iframe' });
    refs[0].current = container;
    effects[0]?.();
    (firstCleanup as (() => void) | undefined)?.();
    effects[1]?.();

    expect(setState).toHaveBeenNthCalledWith(1, null);
    expect(setState).toHaveBeenNthCalledWith(2, renderError);
    expect(setState).toHaveBeenNthCalledWith(3, null);
    expect(second.instance.render).toHaveBeenCalledWith(container, 'iframe');
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

  it('should forward callback refs to the container element and clear them on cleanup', () => {
    const { React, refs, effects } = createReactHarness();
    const { component } = createForgeFrameComponentMock();
    const forwardedRef = vi.fn();

    const ReactComponent = createReactComponent(component as never, { React: React as never });
    (
      ReactComponent as unknown as (
        props: Record<string, unknown>,
        ref: (value: unknown) => void
      ) => unknown
    )({ amount: 1 }, forwardedRef);

    const container = document.createElement('div');
    refs[0].current = container;
    const cleanup = effects[3]?.();

    expect(forwardedRef).toHaveBeenCalledWith(container);

    (cleanup as (() => void) | undefined)?.();

    expect(forwardedRef).toHaveBeenLastCalledWith(null);
  });
});
