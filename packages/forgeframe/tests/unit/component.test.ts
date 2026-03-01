import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  create,
  clearComponents,
  getComponent,
  destroy,
  destroyByTag,
  destroyAll,
  unregisterComponent,
} from '@/core/component';
import { isHost, getHostProps } from '@/core/host';
import { CONTEXT } from '@/constants';
import { prop } from '@/props/prop';

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

  it('should create a component with props definition', () => {
    const MyComponent = create({
      tag: 'my-component-with-props',
      url: 'https://example.com/component',
      props: {
        email: { schema: prop.string(), required: true },
        onLogin: prop.function(),
      },
    });

    expect(MyComponent).toBeDefined();
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
    expect((instance as unknown as { context: string }).context).toBe(
      CONTEXT.POPUP
    );
  });

  it('should support function url options that depend on props', () => {
    const DynamicUrlComponent = create<{ path: string }>({
      tag: 'dynamic-url-component',
      url: (props) => `https://example.com/${props.path}`,
      props: {
        path: { schema: prop.string(), required: true },
      },
    });
    const instance = DynamicUrlComponent({ path: 'checkout' });

    expect(() =>
      DynamicUrlComponent({ path: 'checkout' })
    ).not.toThrow();
    expect((instance as unknown as { resolveUrl: () => string }).resolveUrl()).toBe(
      'https://example.com/checkout'
    );
  });

  it('should support function dimensions options that depend on props', () => {
    const DynamicDimensionsComponent = create<{ height: number }>({
      tag: 'dynamic-dimensions-component',
      url: 'https://example.com',
      props: {
        height: { schema: prop.number(), required: true },
      },
      dimensions: (props) => ({ width: '100%', height: props.height }),
    });
    const instance = DynamicDimensionsComponent({ height: 420 });
    const resolvedDimensions = (
      instance as unknown as {
        resolveDimensions: () => { width: string; height: number };
      }
    ).resolveDimensions();

    expect(() =>
      DynamicDimensionsComponent({ height: 420 })
    ).not.toThrow();
    expect(resolvedDimensions).toEqual({ width: '100%', height: 420 });
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

    const originalInternal = instance as unknown as {
      props: { token?: string };
      resolveUrl: () => string;
    };
    const clonedInternal = cloned as unknown as {
      props: { token?: string };
      resolveUrl: () => string;
    };

    expect(cloned).toBeDefined();
    expect(cloned).not.toBe(instance);
    expect(clonedInternal.props.token).toBe(originalInternal.props.token);
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

    const instanceInternal = instance as unknown as {
      prerender: () => Promise<void>;
      open: () => Promise<void>;
      waitForHost: () => Promise<void>;
    };

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

    const instanceInternal = instance as unknown as {
      waitForHost: () => Promise<void>;
      messenger: { allowedOrigins: Set<string> };
    };

    vi.spyOn(instanceInternal, 'waitForHost').mockResolvedValue(undefined);
    await instance.render(container);

    const allowedOrigins = Array.from(instanceInternal.messenger.allowedOrigins);
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

    const instanceInternal = instance as unknown as {
      waitForHost: () => Promise<void>;
      hostWindow: Window | null;
    };

    vi.spyOn(instanceInternal, 'waitForHost').mockResolvedValue(undefined);
    await instance.render(container);

    await expect(
      instance.updateProps({
        targetUrl: 'https://origin-b.example.com/widget',
      })
    ).rejects.toThrow('Cannot change component URL origin after render');

    instanceInternal.hostWindow = null;
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

    const instanceInternal = instance as unknown as {
      waitForHost: () => Promise<void>;
      hostWindow: Window | null;
    };
    vi.spyOn(instanceInternal, 'waitForHost').mockResolvedValue(undefined);
    await instance.render(container);
    instanceInternal.hostWindow = null;

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

    const instance = ParentComponent({});
    const refs = (
      instance as unknown as {
        buildNestedHostRefs: () => Record<string, unknown> | undefined;
      }
    ).buildNestedHostRefs();

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

    const instance = ParentComponent({});

    expect(() =>
      (
        instance as unknown as {
          buildNestedHostRefs: () => Record<string, unknown> | undefined;
        }
      ).buildNestedHostRefs()
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
    it('should return true for same-domain window', async () => {
      const MyComponent = create({
        tag: 'render-to-test',
        url: 'https://example.com',
      });

      // window is same domain as itself
      const canRender = await MyComponent.canRenderTo(window);

      expect(canRender).toBe(true);
    });

    it('should require configured domain match for cross-domain windows', async () => {
      const MyComponent = create({
        tag: 'render-to-domain-test',
        url: 'https://example.com',
        domain: ['https://widgets.example.com', /^https:\/\/.*\.trusted\.example\.com$/],
      });

      const trustedWindow = {
        location: { origin: 'https://widgets.example.com' },
      } as unknown as Window;
      const untrustedWindow = {
        location: { origin: 'https://evil.example.com' },
      } as unknown as Window;

      await expect(MyComponent.canRenderTo(trustedWindow)).resolves.toBe(true);
      await expect(MyComponent.canRenderTo(untrustedWindow)).resolves.toBe(false);
    });

    it('should allow cross-domain windows with unreadable origin when domain is configured', async () => {
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

      await expect(MyComponent.canRenderTo(crossOriginWindow)).resolves.toBe(true);
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

      const getSiblingInstances = (
        alphaPrimary as unknown as {
          getSiblingInstances: (request: {
            uid: string;
            tag: string;
            options?: { anyConsumer?: boolean };
          }) => Array<{ uid: string; tag: string }>;
        }
      ).getSiblingInstances.bind(alphaPrimary);

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
  });
});
