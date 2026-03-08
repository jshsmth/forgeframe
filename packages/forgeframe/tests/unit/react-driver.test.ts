/**
 * Unit tests for React driver utilities in `@/drivers/react`.
 *
 * Covers component factory wiring, hook integration expectations, prop passthrough, and event-driven cleanup behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createReactComponent, withReactComponent } from '@/drivers/react';
import type { ZoidComponent, ZoidComponentInstance } from '@/types';
import type { EventEmitter } from '@/events/emitter';

/**
 * Creates a lightweight React API mock with observable hook/effect behavior.
 */
const createMockReact = () => {
  let effectCleanup: (() => void) | undefined;
  let effectCallback: (() => void | (() => void)) | undefined;
  const refs: Map<string, { current: unknown }> = new Map();
  const states: Map<string, unknown> = new Map();

  return {
    createElement: vi.fn((type, props, ...children) => ({
      type,
      props: { ...props, children },
    })),
    useRef: vi.fn((initial) => {
      const key = `ref-${refs.size}`;
      if (!refs.has(key)) {
        refs.set(key, { current: initial });
      }
      return refs.get(key)!;
    }),
    useEffect: vi.fn((effect) => {
      effectCallback = effect;
    }),
    useState: vi.fn((initial) => {
      const key = `state-${states.size}`;
      if (!states.has(key)) {
        states.set(key, initial);
      }
      const value = states.get(key);
      const setValue = (newValue: unknown) => {
        states.set(key, newValue);
      };
      return [value, setValue];
    }),
    forwardRef: vi.fn((render) => {
      const component = (props: Record<string, unknown>) => render(props, null);
      return component;
    }),
    // Test helpers
    runEffects: () => {
      if (effectCallback) {
        effectCleanup = effectCallback() as (() => void) | undefined;
      }
    },
    runCleanup: () => {
      if (effectCleanup) {
        effectCleanup();
      }
    },
    getRef: (index: number) => refs.get(`ref-${index}`),
    resetState: () => {
      refs.clear();
      states.clear();
      effectCallback = undefined;
      effectCleanup = undefined;
    },
  };
};

/**
 * Creates a typed ForgeFrame component mock with a reusable instance payload.
 */
const createMockComponent = <P extends Record<string, unknown>>(): ZoidComponent<P> & {
  mockInstance: Partial<ZoidComponentInstance<P>>;
} => {
  const mockEvent = {
    on: vi.fn(() => vi.fn()),
    once: vi.fn(() => vi.fn()),
    emit: vi.fn(),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
  } as unknown as EventEmitter;

  const mockInstance: Partial<ZoidComponentInstance<P>> = {
    render: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    updateProps: vi.fn().mockResolvedValue(undefined),
    event: mockEvent,
  };

  const component = vi.fn().mockReturnValue(mockInstance) as unknown as ZoidComponent<P> & {
    mockInstance: Partial<ZoidComponentInstance<P>>;
  };

  component.mockInstance = mockInstance;
  Object.defineProperty(component, 'name', { value: 'TestComponent', writable: true });
  (component as unknown as { isHost: () => boolean }).isHost = () => false;
  (component as unknown as { instances: unknown[] }).instances = [];

  return component;
};

describe('createReactComponent', () => {
  let mockReact: ReturnType<typeof createMockReact>;
  let mockComponent: ReturnType<typeof createMockComponent>;

  beforeEach(() => {
    mockReact = createMockReact();
    mockComponent = createMockComponent();
  });

  afterEach(() => {
    mockReact.resetState();
    vi.clearAllMocks();
  });

  it('should create a React component', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });

    expect(typeof ReactComponent).toBe('function');
  });

  it('should set displayName', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });

    expect(ReactComponent.displayName).toBe('ForgeFrame(TestComponent)');
  });

  it('should render container div', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });

    ReactComponent({});

    expect(mockReact.createElement).toHaveBeenCalledWith('div', expect.objectContaining({
      style: expect.objectContaining({
        display: 'inline-block',
      }),
    }));
  });

  it('should apply className and style props', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });

    ReactComponent({
      className: 'custom-class',
      style: { background: 'red' },
    });

    expect(mockReact.createElement).toHaveBeenCalledWith('div', expect.objectContaining({
      className: 'custom-class',
      style: expect.objectContaining({
        display: 'inline-block',
        background: 'red',
      }),
    }));
  });

  it('should call useRef for container', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });

    ReactComponent({});

    expect(mockReact.useRef).toHaveBeenCalledWith(null);
  });

  it('should mount the ForgeFrame instance into the container and cleanup on unmount', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });
    const container = document.createElement('div');

    ReactComponent({ context: 'popup' });
    const ref = mockReact.getRef(0);
    if (!ref) {
      throw new Error('Expected container ref to be initialized');
    }
    ref.current = container;
    const mountEffect = mockReact.useEffect.mock.calls[1]?.[0] as
      | (() => void | (() => void))
      | undefined;
    const cleanup = mountEffect?.();

    expect(mockComponent).toHaveBeenCalledWith({});
    expect(mockComponent.mockInstance.render).toHaveBeenCalledWith(container, 'popup');

    (cleanup as (() => void) | undefined)?.();
    expect(mockComponent.mockInstance.close).toHaveBeenCalledTimes(1);
  });

  it('should run prop-sync effect without dependency array and guard with shallow equality', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });
    const onAction = vi.fn();

    ReactComponent({ onAction });

    // Effects are registered in order: onError ref sync, mount, prop-sync, ref-forwarding
    const propSyncDeps = mockReact.useEffect.mock.calls[2]?.[1] as unknown[] | undefined;
    expect(propSyncDeps).toBeUndefined();
  });

  it('should skip updateProps during the first prop-sync pass after mount', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });
    const container = document.createElement('div');

    ReactComponent({ amount: 1 });
    const ref = mockReact.getRef(0);
    if (!ref) {
      throw new Error('Expected container ref to be initialized');
    }
    ref.current = container;

    const mountEffect = mockReact.useEffect.mock.calls[1]?.[0] as (() => void) | undefined;
    const propSyncEffect = mockReact.useEffect.mock.calls[2]?.[0] as
      | (() => void)
      | undefined;

    mountEffect?.();
    propSyncEffect?.();

    expect(mockComponent.mockInstance.updateProps).not.toHaveBeenCalled();
  });

  it('should call useState for error state', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });

    ReactComponent({});

    expect(mockReact.useState).toHaveBeenCalledWith(null);
  });

  it('should call forwardRef', () => {
    createReactComponent(mockComponent, { React: mockReact as never });

    expect(mockReact.forwardRef).toHaveBeenCalled();
  });
});

describe('withReactComponent', () => {
  let mockReact: ReturnType<typeof createMockReact>;

  beforeEach(() => {
    mockReact = createMockReact();
  });

  afterEach(() => {
    mockReact.resetState();
    vi.clearAllMocks();
  });

  it('should return a driver factory', () => {
    const driver = withReactComponent(mockReact as never);

    expect(typeof driver).toBe('function');
  });

  it('should create React component from ForgeFrame component', () => {
    const driver = withReactComponent(mockReact as never);
    const mockComponent = createMockComponent();

    const ReactComponent = driver(mockComponent);

    expect(typeof ReactComponent).toBe('function');
  });

  it('should allow creating multiple components', () => {
    const driver = withReactComponent(mockReact as never);

    const Component1 = driver(createMockComponent());
    const Component2 = driver(createMockComponent());

    expect(Component1).not.toBe(Component2);
  });
});

describe('ReactComponentProps', () => {
  let mockReact: ReturnType<typeof createMockReact>;
  let mockComponent: ReturnType<typeof createMockComponent>;

  beforeEach(() => {
    mockReact = createMockReact();
    mockComponent = createMockComponent();
  });

  afterEach(() => {
    mockReact.resetState();
    vi.clearAllMocks();
  });

  it('should accept onRendered callback', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });
    const onRendered = vi.fn();
    const container = document.createElement('div');

    ReactComponent({ onRendered });
    const ref = mockReact.getRef(0);
    if (!ref) {
      throw new Error('Expected container ref to be initialized');
    }
    ref.current = container;
    const mountEffect = mockReact.useEffect.mock.calls[1]?.[0] as (() => void) | undefined;
    mountEffect?.();

    expect(mockComponent).toHaveBeenCalledWith({});
    expect(mockComponent.mockInstance.event?.once).toHaveBeenCalledWith('rendered', onRendered);
  });

  it('should accept onError callback', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });
    const onError = vi.fn();
    const container = document.createElement('div');

    ReactComponent({ onError });
    const ref = mockReact.getRef(0);
    if (!ref) {
      throw new Error('Expected container ref to be initialized');
    }
    ref.current = container;
    const mountEffect = mockReact.useEffect.mock.calls[1]?.[0] as (() => void) | undefined;
    mountEffect?.();

    expect(mockComponent.mockInstance.event?.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('should accept onClose callback', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });
    const onClose = vi.fn();
    const container = document.createElement('div');

    ReactComponent({ onClose });
    const ref = mockReact.getRef(0);
    if (!ref) {
      throw new Error('Expected container ref to be initialized');
    }
    ref.current = container;
    const mountEffect = mockReact.useEffect.mock.calls[1]?.[0] as (() => void) | undefined;
    mountEffect?.();

    expect(mockComponent.mockInstance.event?.once).toHaveBeenCalledWith('close', onClose);
  });

  it('should accept context prop', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });
    const container = document.createElement('div');

    ReactComponent({ context: 'popup' });
    const ref = mockReact.getRef(0);
    if (!ref) {
      throw new Error('Expected container ref to be initialized');
    }
    ref.current = container;
    const mountEffect = mockReact.useEffect.mock.calls[1]?.[0] as (() => void) | undefined;
    mountEffect?.();

    expect(mockComponent.mockInstance.render).toHaveBeenCalledWith(container, 'popup');
  });

  it('should pass component-specific props to ForgeFrame component', () => {
    interface TestProps {
      customProp: string;
      anotherProp: number;
    }

    const typedMockComponent = createMockComponent<TestProps>();
    const ReactComponent = createReactComponent(typedMockComponent, { React: mockReact as never });
    const container = document.createElement('div');

    ReactComponent({
      customProp: 'test',
      anotherProp: 42,
      context: 'popup',
      className: 'wrapper',
      onClose: vi.fn(),
    });
    const ref = mockReact.getRef(0);
    if (!ref) {
      throw new Error('Expected container ref to be initialized');
    }
    ref.current = container;
    const mountEffect = mockReact.useEffect.mock.calls[1]?.[0] as (() => void) | undefined;
    mountEffect?.();

    expect(typedMockComponent).toHaveBeenCalledWith({
      customProp: 'test',
      anotherProp: 42,
    });
  });
});

describe('Error handling', () => {
  let mockReact: ReturnType<typeof createMockReact>;

  beforeEach(() => {
    mockReact = createMockReact();
  });

  afterEach(() => {
    mockReact.resetState();
    vi.clearAllMocks();
  });

  it('should forward render failures to the onError callback', async () => {
    const mockComponent = createMockComponent();
    const renderError = new Error('Test error');
    const onError = vi.fn();
    const container = document.createElement('div');

    (
      mockComponent.mockInstance.render as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(renderError);

    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });
    ReactComponent({ onError });

    const ref = mockReact.getRef(0);
    if (!ref) {
      throw new Error('Expected container ref to be initialized');
    }
    ref.current = container;

    const mountEffect = mockReact.useEffect.mock.calls[1]?.[0] as (() => void) | undefined;
    mountEffect?.();
    await Promise.resolve();

    expect(mockComponent.mockInstance.render).toHaveBeenCalledWith(container, undefined);
    expect(onError).toHaveBeenCalledWith(renderError);
  });
});

describe('Lifecycle integration', () => {
  it('should integrate with ForgeFrame event system and cleanup on unmount', () => {
    const mockReact = createMockReact();
    const mockComponent = createMockComponent();
    const container = document.createElement('div');

    const onRendered = vi.fn();
    const onError = vi.fn();
    const onClose = vi.fn();

    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });

    ReactComponent({
      onRendered,
      onError,
      onClose,
    });
    const ref = mockReact.getRef(0);
    if (!ref) {
      throw new Error('Expected container ref to be initialized');
    }
    ref.current = container;
    const mountEffect = mockReact.useEffect.mock.calls[1]?.[0] as
      | (() => void | (() => void))
      | undefined;
    const cleanup = mountEffect?.();

    expect(mockComponent.mockInstance.event?.once).toHaveBeenCalledWith('rendered', onRendered);
    expect(mockComponent.mockInstance.event?.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockComponent.mockInstance.event?.once).toHaveBeenCalledWith('close', onClose);

    (cleanup as (() => void) | undefined)?.();
    expect(mockComponent.mockInstance.close).toHaveBeenCalledTimes(1);
  });
});
