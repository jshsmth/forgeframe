/**
 * Unit tests for `@/core/component` and host context helpers.
 *
 * Covers component registration, instance lifecycle, dynamic option materialization, and host detection/eligibility behavior.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  create,
  clearComponents,
  getComponent,
  destroy,
  destroyByTag,
  destroyAll,
  getComponentOptions,
  unregisterComponent,
} from '@/core/component';
import { buildNestedHostRefs } from '@/core/consumer/child-refs';
import { getSiblingInstances } from '@/core/consumer/siblings';
import { isHost, getHostProps } from '@/core/host';
import { CONTEXT } from '@/constants';
import { prop } from '@/props/prop';

type ConsumerInternals = {
  renderer: {
    context: string;
  };
  transport: {
    hostWindow: Window | null;
    messenger: {
      allowedOrigins: Set<string>;
    };
  };
  propsPipeline: {
    props: Record<string, unknown>;
  };
  waitForHost: () => Promise<void>;
  prerender: () => Promise<void>;
  open: () => Promise<void>;
  resolveUrl: () => string;
  resolveDimensions: () => { width: number | string; height: number | string };
};

function getConsumerInternals(instance: unknown): ConsumerInternals {
  return instance as ConsumerInternals;
}

describe('Component Creation', () => {
  afterEach(() => {
    clearComponents();
  });

  it('should create a component with basic options', () => {
    const MyComponent = create({
      tag: 'my-component',
      url: 'https://example.com/component',
    });

    expect(MyComponent).toBeDefined();
    expect(typeof MyComponent).toBe('function');
    expect(MyComponent.isHost()).toBe(false);
    expect(MyComponent.instances).toEqual([]);
  });

  it('should allow relative string urls in browser environments', () => {
    const MyComponent = create({
      tag: 'relative-url-component',
      url: '/component.html',
    });

    expect(MyComponent).toBeDefined();
    expect(MyComponent.isHost()).toBe(false);
  });

  it('should validate required props on render and preserve function props on valid instances', async () => {
    const MyComponent = create({
      tag: 'my-component-with-props',
      url: 'https://example.com/component',
      props: {
        email: { schema: prop.string(), required: true },
        onLogin: prop.function(),
      },
    });
    const onLogin = vi.fn();
    const invalidInstance = MyComponent({ onLogin });
    const container = document.createElement('div');

    await expect(invalidInstance.render(container)).rejects.toThrow(
      'Prop "email" is required but was not provided'
    );

    const instance = MyComponent({
      email: 'user@example.com',
      onLogin,
    });
    const internalProps = getConsumerInternals(instance).propsPipeline.props as {
      email: string;
      onLogin: typeof onLogin;
    };

    expect(internalProps).toMatchObject({
      email: 'user@example.com',
    });
    expect(internalProps.onLogin).toBe(onLogin);
  });

  it('should throw error for invalid tag', () => {
    expect(() =>
      create({
        tag: 'Invalid-Tag',
        url: 'https://example.com',
      })
    ).toThrow('Invalid component tag');
  });

  it('should throw error for missing tag', () => {
    expect(() =>
      create({
        tag: '',
        url: 'https://example.com',
      })
    ).toThrow('Component tag is required');
  });

  it('should throw error for missing url', () => {
    expect(() =>
      create({
        tag: 'my-component',
        url: '',
      })
    ).toThrow('Component url is required');
  });

  it('should throw error for duplicate tag', () => {
    create({
      tag: 'duplicate-tag',
      url: 'https://example.com',
    });

    expect(() =>
      create({
        tag: 'duplicate-tag',
        url: 'https://example.com',
      })
    ).toThrow('already registered');
  });

  it('should create an instance when called', () => {
    const MyComponent = create({
      tag: 'test-instance',
      url: 'https://example.com',
    });

    const instance = MyComponent({ customProp: 'value' });

    expect(instance).toBeDefined();
    expect(typeof instance.render).toBe('function');
    expect(typeof instance.close).toBe('function');
    expect(typeof instance.updateProps).toBe('function');
    expect(instance.event).toBeDefined();
    expect(MyComponent.instances.length).toBe(1);
  });

  it('should support custom dimensions', () => {
    const MyComponent = create({
      tag: 'sized-component',
      url: 'https://example.com',
      dimensions: { width: 400, height: 300 },
    });
    const instance = MyComponent({});
    const resolvedDimensions = (
      instance as unknown as { resolveDimensions: () => { width: number; height: number } }
    ).resolveDimensions();

    expect(MyComponent).toBeDefined();
    expect(resolvedDimensions).toEqual({ width: 400, height: 300 });
  });

  it('should support default context', () => {
    const PopupComponent = create({
      tag: 'popup-component',
      url: 'https://example.com',
      defaultContext: CONTEXT.POPUP,
    });
    const instance = PopupComponent({});

    expect(PopupComponent).toBeDefined();
    expect(getConsumerInternals(instance).renderer.context).toBe(CONTEXT.POPUP);
  });

  it('should materialize function url options from the latest normalized props', async () => {
    const DynamicUrlComponent = create<{ path: string }>({
      tag: 'dynamic-url-component',
      url: (props) => `https://example.com/${props.path}`,
      props: {
        path: { schema: prop.string(), required: true },
      },
    });
    const instance = DynamicUrlComponent({ path: 'checkout' });
    const internal = getConsumerInternals(instance);

    expect(internal.propsPipeline.props.path).toBe('checkout');
    expect(internal.resolveUrl()).toBe('https://example.com/checkout');

    await instance.updateProps({ path: 'billing' });

    expect(internal.propsPipeline.props.path).toBe('billing');
    expect(internal.resolveUrl()).toBe('https://example.com/billing');
  });

  it('should materialize function dimensions options from the latest normalized props', async () => {
    const DynamicDimensionsComponent = create<{ height: number }>({
      tag: 'dynamic-dimensions-component',
      url: 'https://example.com',
      props: {
        height: { schema: prop.number(), required: true },
      },
      dimensions: (props) => ({ width: '100%', height: props.height }),
    });
    const instance = DynamicDimensionsComponent({ height: 420 });
    const internal = getConsumerInternals(instance);

    expect(internal.propsPipeline.props.height).toBe(420);
    expect(internal.resolveDimensions()).toEqual({ width: '100%', height: 420 });

    await instance.updateProps({ height: 560 });

    expect(internal.propsPipeline.props.height).toBe(560);
    expect(internal.resolveDimensions()).toEqual({ width: '100%', height: 560 });
  });

  it('should allow construction-time PropContext.onError from value and default resolvers', () => {
    const onError = vi.fn();
    const valueResolverError = new Error('value resolver error');
    const defaultResolverError = new Error('default resolver error');
    const ResolverComponent = create<Record<string, unknown>>({
      tag: 'resolver-on-error-component',
      url: 'https://example.com',
      props: {
        computed: {
          schema: prop.string(),
          value: (ctx) => {
            ctx.onError(valueResolverError);
            return 'computed-value';
          },
        },
        fallback: {
          schema: prop.string(),
          default: (ctx) => {
            ctx.onError(defaultResolverError);
            return 'default-value';
          },
        },
      },
    });

    const instance = ResolverComponent({ onError });
    const internal = getConsumerInternals(instance);

    expect(onError).toHaveBeenNthCalledWith(1, valueResolverError);
    expect(onError).toHaveBeenNthCalledWith(2, defaultResolverError);
    expect(internal.propsPipeline.props.computed).toBe('computed-value');
    expect(internal.propsPipeline.props.fallback).toBe('default-value');
  });

  it('should tolerate construction-time PropContext.close from value resolvers', async () => {
    const CloseResolverComponent = create<Record<string, unknown>>({
      tag: 'resolver-close-component',
      url: 'https://example.com',
      props: {
        computed: {
          schema: prop.string(),
          value: (ctx) => {
            void ctx.close();
            return 'closed-during-construction';
          },
        },
      },
    });

    const instance = CloseResolverComponent({});

    await Promise.resolve();
    await Promise.resolve();

    await expect(instance.render(document.createElement('div'))).rejects.toThrow(
      'Component has been destroyed'
    );
  });

  it('should tolerate construction-time PropContext.focus from default resolvers', async () => {
    const FocusResolverComponent = create<Record<string, unknown>>({
      tag: 'resolver-focus-component',
      url: 'https://example.com',
      props: {
        computed: {
          schema: prop.string(),
          default: (ctx) => {
            void ctx.focus();
            return 'focused-during-construction';
          },
        },
      },
    });

    const instance = FocusResolverComponent({});
    const internal = getConsumerInternals(instance);

    await Promise.resolve();

    expect(internal.propsPipeline.props.computed).toBe('focused-during-construction');
  });

  it('should tolerate construction-time PropContext.close followed by updateProps', async () => {
    const CloseResolverComponent = create<{
      amount?: number;
      computed?: string;
    }>({
      tag: 'resolver-close-update-props-component',
      url: 'https://example.com',
      props: {
        amount: { schema: prop.number().optional() },
        computed: {
          schema: prop.string().optional(),
          value: (ctx) => {
            void ctx.close();
            return 'closed-during-construction';
          },
        },
      },
    });

    const instance = CloseResolverComponent({});
    const internal = getConsumerInternals(instance);

    await Promise.resolve();
    await Promise.resolve();

    await expect(instance.updateProps({ amount: 2 })).resolves.toBeUndefined();
    expect(internal.propsPipeline.props.amount).toBe(2);
  });

  it('should tolerate construction-time PropContext.close followed by resize', async () => {
    const onResize = vi.fn();
    const CloseResolverComponent = create<Record<string, unknown>>({
      tag: 'resolver-close-resize-component',
      url: 'https://example.com',
      props: {
        computed: {
          schema: prop.string(),
          value: (ctx) => {
            void ctx.close();
            return 'closed-during-construction';
          },
        },
      },
    });

    const instance = CloseResolverComponent({ onResize });
    const internal = getConsumerInternals(instance);
    const resizeSpy = vi.spyOn(internal.renderer as { resize: (...args: unknown[]) => void }, 'resize');
    const dimensions = { width: 320, height: 200 };

    await Promise.resolve();
    await Promise.resolve();

    await expect(instance.resize(dimensions)).resolves.toBeUndefined();
    expect(resizeSpy).toHaveBeenCalledWith(dimensions, null);
    expect(onResize).toHaveBeenCalledWith(dimensions);
  });
});

describe('Component Instance', () => {
  afterEach(() => {
    clearComponents();
  });

  it('should check eligibility', () => {
    const MyComponent = create<{ allowed: boolean }>({
      tag: 'eligible-component',
      url: 'https://example.com',
      props: {
        allowed: { schema: prop.boolean(), required: true },
      },
      eligible: ({ props }) => ({
        eligible: props.allowed === true,
        reason: 'Not allowed',
      }),
    });

    const eligibleInstance = MyComponent({ allowed: true });
    const ineligibleInstance = MyComponent({ allowed: false });

    expect(eligibleInstance.isEligible()).toBe(true);
    expect(ineligibleInstance.isEligible()).toBe(false);
  });

  it('should clone an instance with the same normalized props snapshot', () => {
    let tokenCounter = 0;
    const MyComponent = create<{ token?: string }>({
      tag: 'clone-test',
      url: (props) => `https://example.com/${props.token}`,
      props: {
        token: {
          schema: prop.string().optional(),
          value: () => `token-${++tokenCounter}`,
        },
      },
    });

    const instance = MyComponent({});
    const cloned = instance.clone();

    const originalInternal = getConsumerInternals(instance);
    const clonedInternal = getConsumerInternals(cloned);

    expect(cloned).toBeDefined();
    expect(cloned).not.toBe(instance);
    expect(clonedInternal.propsPipeline.props.token).toBe(
      originalInternal.propsPipeline.props.token
    );
    expect(clonedInternal.resolveUrl()).toBe(originalInternal.resolveUrl());
    expect(tokenCounter).toBe(1);
  });

  it('should call component validate on render and updateProps', async () => {
    const validate = vi.fn();
    const MyComponent = create<{ amount: number }>({
      tag: 'validate-option-component',
      url: 'https://example.com',
      props: {
        amount: { schema: prop.number(), required: true },
      },
      validate,
    });

    const instance = MyComponent({ amount: 10 });
    const container = document.createElement('div');
    document.body.appendChild(container);

    const instanceInternal = getConsumerInternals(instance);

    vi.spyOn(instanceInternal, 'prerender').mockResolvedValue(undefined);
    vi.spyOn(instanceInternal, 'open').mockResolvedValue(undefined);
    vi.spyOn(instanceInternal, 'waitForHost').mockResolvedValue(undefined);

    await instance.render(container);
    await instance.updateProps({ amount: 20 });

    expect(validate).toHaveBeenCalledTimes(2);
    expect(validate).toHaveBeenNthCalledWith(1, {
      props: expect.objectContaining({ amount: 10 }),
    });
    expect(validate).toHaveBeenNthCalledWith(2, {
      props: expect.objectContaining({ amount: 20 }),
    });

    container.remove();
  });

  it('should trust updated url origin before first render', async () => {
    const DynamicUrlComponent = create<{ targetUrl: string }>({
      tag: 'dynamic-origin-trust-component',
      url: (props) => props.targetUrl,
      props: {
        targetUrl: { schema: prop.string(), required: true },
      },
    });

    const instance = DynamicUrlComponent({
      targetUrl: 'https://origin-a.example.com/widget',
    });

    await instance.updateProps({
      targetUrl: 'https://origin-b.example.com/widget',
    });

    const container = document.createElement('div');
    document.body.appendChild(container);

    const instanceInternal = getConsumerInternals(instance);

    vi.spyOn(instanceInternal, 'waitForHost').mockResolvedValue(undefined);
    await instance.render(container);

    const allowedOrigins = Array.from(instanceInternal.transport.messenger.allowedOrigins);
    expect(allowedOrigins).toContain('https://origin-b.example.com');
    expect(allowedOrigins).not.toContain('https://origin-a.example.com');

    await instance.close();
    container.remove();
  });

  it('should apply idle updateProps synchronously before awaiting', async () => {
    const DynamicUrlComponent = create<{ targetUrl: string }>({
      tag: 'dynamic-origin-sync-update-component',
      url: (props) => props.targetUrl,
      props: {
        targetUrl: { schema: prop.string(), required: true },
      },
    });

    const instance = DynamicUrlComponent({
      targetUrl: 'https://origin-a.example.com/widget',
    });

    const pendingUpdate = instance.updateProps({
      targetUrl: 'https://origin-b.example.com/widget',
    });

    const resolvedUrlAfterUpdateCall = (
      instance as unknown as {
        resolveUrl: () => string;
      }
    ).resolveUrl();

    expect(resolvedUrlAfterUpdateCall).toBe('https://origin-b.example.com/widget');
    await pendingUpdate;
  });

  it('should reject url origin changes after render', async () => {
    const DynamicUrlComponent = create<{ targetUrl: string }>({
      tag: 'dynamic-origin-after-render-component',
      url: (props) => props.targetUrl,
      props: {
        targetUrl: { schema: prop.string(), required: true },
      },
    });

    const instance = DynamicUrlComponent({
      targetUrl: 'https://origin-a.example.com/widget',
    });

    const container = document.createElement('div');
    document.body.appendChild(container);

    const instanceInternal = getConsumerInternals(instance);

    vi.spyOn(instanceInternal, 'waitForHost').mockResolvedValue(undefined);
    await instance.render(container);

    await expect(
      instance.updateProps({
        targetUrl: 'https://origin-b.example.com/widget',
      })
    ).rejects.toThrow('Cannot change component URL origin after render');

    instanceInternal.transport.hostWindow = null;
    await expect(instance.updateProps({})).resolves.toBeUndefined();

    const resolvedUrlAfterFailedUpdate = (
      instance as unknown as {
        resolveUrl: () => string;
      }
    ).resolveUrl();
    expect(resolvedUrlAfterFailedUpdate).toBe('https://origin-a.example.com/widget');

    await instance.close();
    container.remove();
  });

  it('should not rematerialize URL-driving value props on unrelated updateProps after render', async () => {
    let valueCalls = 0;
    const DynamicUrlComponent = create<{
      amount?: number;
      targetUrl?: string;
    }>({
      tag: 'dynamic-origin-stable-materialized-prop-component',
      url: (props) => props.targetUrl ?? 'https://origin-a.example.com/widget',
      props: {
        amount: { schema: prop.number().optional() },
        targetUrl: {
          schema: prop.string().optional(),
          value: () => {
            valueCalls += 1;
            return valueCalls === 1
              ? 'https://origin-a.example.com/widget'
              : 'https://origin-b.example.com/widget';
          },
        },
      },
    });

    const instance = DynamicUrlComponent({});
    const container = document.createElement('div');
    document.body.appendChild(container);

    const instanceInternal = getConsumerInternals(instance);
    vi.spyOn(instanceInternal, 'waitForHost').mockResolvedValue(undefined);
    await instance.render(container);
    instanceInternal.transport.hostWindow = null;

    await expect(instance.updateProps({ amount: 1 })).resolves.toBeUndefined();
    expect(
      (instance as unknown as { resolveUrl: () => string }).resolveUrl()
    ).toBe('https://origin-a.example.com/widget');
    expect(valueCalls).toBe(1);

    await instance.close();
    container.remove();
  });

  it('should build nested host refs from component metadata', () => {
    const ChildComponent = create({
      tag: 'child-component-meta',
      url: 'https://example.com/child',
      dimensions: { width: 250, height: 140 },
      defaultContext: CONTEXT.POPUP,
      props: {
        value: prop.string(),
      },
    });

    const ParentComponent = create({
      tag: 'parent-component-meta',
      url: 'https://example.com/parent',
      children: () => ({
        ChildComponent,
      }),
    });

    const refs = buildNestedHostRefs(getComponentOptions(ParentComponent)!, {});

    expect(refs?.ChildComponent).toEqual({
      tag: 'child-component-meta',
      url: 'https://example.com/child',
      props: expect.any(Object),
      dimensions: { width: 250, height: 140 },
      defaultContext: CONTEXT.POPUP,
    });
  });

  it('should throw when nested child component uses dynamic url', () => {
    const DynamicChild = create<{ childPath: string }>({
      tag: 'dynamic-child-url-component',
      url: (props) => `https://example.com/${props.childPath}`,
      props: {
        childPath: { schema: prop.string(), required: true },
      },
    });

    const ParentComponent = create({
      tag: 'parent-with-dynamic-child',
      url: 'https://example.com/parent',
      children: () => ({
        DynamicChild,
      }),
    });

    expect(() =>
      buildNestedHostRefs(getComponentOptions(ParentComponent)!, {})
    ).toThrow('must use a static string URL');
  });
});

describe('Component Registry', () => {
  afterEach(() => {
    clearComponents();
  });

  describe('getComponent', () => {
    it('should retrieve a registered component by tag', () => {
      const MyComponent = create({
        tag: 'retrievable-component',
        url: 'https://example.com',
      });

      const retrieved = getComponent('retrievable-component');

      expect(retrieved).toBe(MyComponent);
    });

    it('should return undefined for non-existent tag', () => {
      const retrieved = getComponent('non-existent');

      expect(retrieved).toBeUndefined();
    });

    it('should work with typed components', () => {
      interface MyProps {
        name: string;
      }

      create<MyProps>({
        tag: 'typed-component',
        url: 'https://example.com',
        props: {
          name: prop.string(),
        },
      });

      const retrieved = getComponent<MyProps>('typed-component');

      expect(retrieved).toBeDefined();
    });
  });

  describe('unregisterComponent', () => {
    it('should remove a component from the registry', () => {
      create({
        tag: 'to-unregister',
        url: 'https://example.com',
      });

      expect(getComponent('to-unregister')).toBeDefined();

      unregisterComponent('to-unregister');

      expect(getComponent('to-unregister')).toBeUndefined();
    });

    it('should not throw when unregistering non-existent component', () => {
      expect(() => unregisterComponent('does-not-exist')).not.toThrow();
    });

    it('should allow re-registering a component after unregistration', () => {
      create({
        tag: 're-register-test',
        url: 'https://example.com/first',
      });

      unregisterComponent('re-register-test');

      // Should not throw - can register again
      const NewComponent = create({
        tag: 're-register-test',
        url: 'https://example.com/second',
      });

      expect(NewComponent).toBeDefined();
    });
  });
});

describe('Component Destruction', () => {
  afterEach(() => {
    clearComponents();
  });

  describe('destroy', () => {
    it('should call close on the instance', async () => {
      const MyComponent = create({
        tag: 'destroy-single',
        url: 'https://example.com',
      });

      const instance = MyComponent({});
      const closeSpy = vi.spyOn(instance, 'close');

      await destroy(instance);

      expect(closeSpy).toHaveBeenCalled();
    });

    it('should emit close event when calling close', async () => {
      const MyComponent = create({
        tag: 'destroy-event-test',
        url: 'https://example.com',
      });

      const instance = MyComponent({});
      const closeHandler = vi.fn();
      instance.event.on('close', closeHandler);

      await instance.close();

      expect(closeHandler).toHaveBeenCalled();
    });

    it('should remove instance from instances array on destroy event', () => {
      const MyComponent = create({
        tag: 'destroy-removal-test',
        url: 'https://example.com',
      });

      const instance = MyComponent({});
      expect(MyComponent.instances.length).toBe(1);

      // Manually emit destroy event to test the listener
      instance.event.emit('destroy');

      expect(MyComponent.instances.length).toBe(0);
    });

    it('should remove instance from instances array when close is called', async () => {
      const MyComponent = create({
        tag: 'destroy-removal-close-test',
        url: 'https://example.com',
      });

      const instance = MyComponent({});
      expect(MyComponent.instances.length).toBe(1);

      await instance.close();

      expect(MyComponent.instances.length).toBe(0);
    });
  });

  describe('destroyByTag', () => {
    it('should call close on all instances of a specific component', async () => {
      const MyComponent = create({
        tag: 'destroy-all-of-type',
        url: 'https://example.com',
      });

      const instance1 = MyComponent({});
      const instance2 = MyComponent({});
      const instance3 = MyComponent({});

      const spy1 = vi.spyOn(instance1, 'close');
      const spy2 = vi.spyOn(instance2, 'close');
      const spy3 = vi.spyOn(instance3, 'close');

      expect(MyComponent.instances.length).toBe(3);

      await destroyByTag('destroy-all-of-type');

      expect(spy1).toHaveBeenCalled();
      expect(spy2).toHaveBeenCalled();
      expect(spy3).toHaveBeenCalled();
    });

    it('should not affect other components', async () => {
      const ComponentA = create({
        tag: 'component-a',
        url: 'https://example.com/a',
      });

      const ComponentB = create({
        tag: 'component-b',
        url: 'https://example.com/b',
      });

      const instanceA1 = ComponentA({});
      const instanceA2 = ComponentA({});
      const instanceB = ComponentB({});

      const spyA1 = vi.spyOn(instanceA1, 'close');
      const spyA2 = vi.spyOn(instanceA2, 'close');
      const spyB = vi.spyOn(instanceB, 'close');

      await destroyByTag('component-a');

      expect(spyA1).toHaveBeenCalled();
      expect(spyA2).toHaveBeenCalled();
      expect(spyB).not.toHaveBeenCalled();
    });

    it('should not throw for non-existent component tag', async () => {
      await expect(destroyByTag('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('destroyAll', () => {
    it('should call close on all instances of all components', async () => {
      const ComponentA = create({
        tag: 'global-destroy-a',
        url: 'https://example.com/a',
      });

      const ComponentB = create({
        tag: 'global-destroy-b',
        url: 'https://example.com/b',
      });

      const instanceA1 = ComponentA({});
      const instanceA2 = ComponentA({});
      const instanceB1 = ComponentB({});
      const instanceB2 = ComponentB({});

      const spyA1 = vi.spyOn(instanceA1, 'close');
      const spyA2 = vi.spyOn(instanceA2, 'close');
      const spyB1 = vi.spyOn(instanceB1, 'close');
      const spyB2 = vi.spyOn(instanceB2, 'close');

      await destroyAll();

      expect(spyA1).toHaveBeenCalled();
      expect(spyA2).toHaveBeenCalled();
      expect(spyB1).toHaveBeenCalled();
      expect(spyB2).toHaveBeenCalled();
    });

    it('should work when no components exist', async () => {
      await expect(destroyAll()).resolves.toBeUndefined();
    });
  });
});

describe('Host Context Detection', () => {
  afterEach(() => {
    clearComponents();
  });

  describe('isHost', () => {
    it('should return false when not in a ForgeFrame host window', () => {
      // In normal test environment, we're not in a host window
      expect(isHost()).toBe(false);
    });
  });

  describe('getHostProps', () => {
    it('should return undefined when not in a host context', () => {
      const props = getHostProps();
      expect(props).toBeUndefined();
    });

    it('should return hostProps from window when available', () => {
      // Temporarily set hostProps on window
      const mockHostProps = {
        uid: 'test-uid',
        tag: 'test-tag',
        testProp: 'value',
        close: vi.fn(),
        focus: vi.fn(),
        resize: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        onProps: vi.fn(),
        onError: vi.fn(),
        getConsumer: vi.fn(),
        getConsumerDomain: vi.fn(),
        export: vi.fn(),
        consumer: { props: {}, export: vi.fn() },
        getPeerInstances: vi.fn(),
      };

      (window as unknown as { hostProps: typeof mockHostProps }).hostProps = mockHostProps;

      const props = getHostProps();
      expect(props).toBe(mockHostProps);

      // Cleanup
      delete (window as unknown as { hostProps?: typeof mockHostProps }).hostProps;
    });
  });

  describe('Component.isHost', () => {
    it('should return false when not in component host context', () => {
      const MyComponent = create({
        tag: 'host-check-component',
        url: 'https://example.com',
      });

      expect(MyComponent.isHost()).toBe(false);
    });
  });

  describe('Component.canRenderTo', () => {
    it('should return true for current window', async () => {
      const MyComponent = create({
        tag: 'render-to-test',
        url: 'https://example.com',
      });

      const canRender = await MyComponent.canRenderTo(window);

      expect(canRender).toBe(true);
    });

    it('should return false for other windows', async () => {
      const MyComponent = create({
        tag: 'render-to-domain-test',
        url: 'https://example.com',
      });

      const otherWindow = { location: { origin: window.location.origin } } as unknown as Window;
      await expect(MyComponent.canRenderTo(otherWindow)).resolves.toBe(false);
    });

    it('should return false for cross-domain windows even when domain is configured', async () => {
      const MyComponent = create({
        tag: 'render-to-cross-origin-window-test',
        url: 'https://example.com',
        domain: 'https://widgets.example.com',
      });

      const crossOriginWindow = {
        get location() {
          throw new Error('Cross-origin access denied');
        },
      } as unknown as Window;

      await expect(MyComponent.canRenderTo(crossOriginWindow)).resolves.toBe(false);
    });
  });

  describe('Component peer discovery', () => {
    it('should include all registered component tags when anyConsumer is true', async () => {
      const AlphaComponent = create({
        tag: 'peer-alpha',
        url: 'https://example.com/alpha',
      });
      const BetaComponent = create({
        tag: 'peer-beta',
        url: 'https://example.com/beta',
      });

      const alphaPrimary = AlphaComponent({});
      const alphaSibling = AlphaComponent({});
      const betaSibling = BetaComponent({});

      const sameTagSiblings = getSiblingInstances({
        uid: alphaPrimary.uid,
        tag: 'peer-alpha',
      });
      const anyConsumerSiblings = getSiblingInstances({
        uid: alphaPrimary.uid,
        tag: 'peer-alpha',
        options: { anyConsumer: true },
      });

      expect(sameTagSiblings).toEqual([
        expect.objectContaining({
          uid: alphaSibling.uid,
          tag: 'peer-alpha',
        }),
      ]);
      expect(anyConsumerSiblings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uid: alphaSibling.uid,
            tag: 'peer-alpha',
          }),
          expect.objectContaining({
            uid: betaSibling.uid,
            tag: 'peer-beta',
          }),
        ])
      );
      expect(anyConsumerSiblings.some((sibling) => sibling.uid === alphaPrimary.uid)).toBe(false);

      await Promise.all([
        alphaPrimary.close(),
        alphaSibling.close(),
        betaSibling.close(),
      ]);
    });

    it('should update indexed peers when sibling instances are destroyed', async () => {
      const IndexedComponent = create({
        tag: 'peer-index-cleanup',
        url: 'https://example.com/peer-index-cleanup',
      });

      const primary = IndexedComponent({});
      const sibling = IndexedComponent({});

      expect(
        getSiblingInstances({
          uid: primary.uid,
          tag: 'peer-index-cleanup',
        })
      ).toEqual([
        expect.objectContaining({
          uid: sibling.uid,
          tag: 'peer-index-cleanup',
        }),
      ]);

      await sibling.close();

      expect(
        getSiblingInstances({
          uid: primary.uid,
          tag: 'peer-index-cleanup',
        })
      ).toEqual([]);

      await primary.close();
    });

    it('should exclude unregistered tags from anyConsumer sibling lookup', async () => {
      const AlphaComponent = create({
        tag: 'peer-index-unregister-alpha',
        url: 'https://example.com/peer-index-unregister-alpha',
      });
      const BetaComponent = create({
        tag: 'peer-index-unregister-beta',
        url: 'https://example.com/peer-index-unregister-beta',
      });

      const alphaPrimary = AlphaComponent({});
      const betaSibling = BetaComponent({});

      const siblingsBeforeUnregister = getSiblingInstances({
        uid: alphaPrimary.uid,
        tag: 'peer-index-unregister-alpha',
        options: { anyConsumer: true },
      });
      expect(siblingsBeforeUnregister.some((sibling) => sibling.uid === betaSibling.uid)).toBe(true);

      unregisterComponent('peer-index-unregister-beta');

      const siblingsAfterUnregister = getSiblingInstances({
        uid: alphaPrimary.uid,
        tag: 'peer-index-unregister-alpha',
        options: { anyConsumer: true },
      });
      expect(siblingsAfterUnregister.some((sibling) => sibling.uid === betaSibling.uid)).toBe(false);

      await Promise.all([alphaPrimary.close(), betaSibling.close()]);
    });
  });
});
