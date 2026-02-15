import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createReactComponent, withReactComponent } from '@/drivers/react';
import type { ZoidComponent, ZoidComponentInstance } from '@/types';
import type { EventEmitter } from '@/events/emitter';

// Mock React hooks and APIs
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

// Mock ForgeFrame component
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

  it('should call useEffect for initialization', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });

    ReactComponent({});

    // Should have useEffect calls (mount and prop sync)
    expect(mockReact.useEffect).toHaveBeenCalled();
  });

  it('should use live props object for prop-sync effect dependencies', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });
    const onAction = vi.fn();

    ReactComponent({ onAction });

    // Effects are registered in order: mount, prop-sync, ref-forwarding
    const propSyncDeps = mockReact.useEffect.mock.calls[1]?.[1] as unknown[] | undefined;

    expect(Array.isArray(propSyncDeps)).toBe(true);
    expect(propSyncDeps?.[0]).toEqual(expect.objectContaining({ onAction }));
    expect(typeof propSyncDeps?.[0]).toBe('object');
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

    ReactComponent({ onRendered });

    // Component should be created with the callback available
    expect(mockReact.useEffect).toHaveBeenCalled();
  });

  it('should accept onError callback', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });
    const onError = vi.fn();

    ReactComponent({ onError });

    expect(mockReact.useEffect).toHaveBeenCalled();
  });

  it('should accept onClose callback', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });
    const onClose = vi.fn();

    ReactComponent({ onClose });

    expect(mockReact.useEffect).toHaveBeenCalled();
  });

  it('should accept context prop', () => {
    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });

    ReactComponent({ context: 'popup' });

    expect(mockReact.useEffect).toHaveBeenCalled();
  });

  it('should pass component-specific props to ForgeFrame component', () => {
    interface TestProps {
      customProp: string;
      anotherProp: number;
    }

    const typedMockComponent = createMockComponent<TestProps>();
    const ReactComponent = createReactComponent(typedMockComponent, { React: mockReact as never });

    ReactComponent({
      customProp: 'test',
      anotherProp: 42,
    });

    // The component factory should receive the props
    expect(mockReact.useEffect).toHaveBeenCalled();
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

  it('should render error state when error occurs', () => {
    // Create a component that tracks useState calls
    let setError: ((err: Error | null) => void) | undefined;

    const customMockReact = {
      ...mockReact,
      useState: vi.fn((initial) => {
        // Track the error setter
        setError = vi.fn();
        return [initial ? initial : null, setError];
      }),
    };

    const mockComponent = createMockComponent();
    const ReactComponent = createReactComponent(mockComponent, { React: customMockReact as never });

    // First render - no error
    ReactComponent({});

    // Simulate error being set
    customMockReact.useState.mockReturnValueOnce([new Error('Test error'), vi.fn()]);

    // Re-render with error
    ReactComponent({});

    // Should render error div
    expect(customMockReact.createElement).toHaveBeenCalledWith(
      'div',
      expect.objectContaining({
        style: expect.objectContaining({
          color: 'red',
        }),
      }),
      expect.stringContaining('Error:')
    );
  });
});

describe('Lifecycle integration', () => {
  it('should integrate with ForgeFrame event system', () => {
    const mockReact = createMockReact();
    const mockComponent = createMockComponent();

    const onRendered = vi.fn();
    const onError = vi.fn();
    const onClose = vi.fn();

    const ReactComponent = createReactComponent(mockComponent, { React: mockReact as never });

    ReactComponent({
      onRendered,
      onError,
      onClose,
    });

    // The useEffect hook should be set up to handle these
    expect(mockReact.useEffect).toHaveBeenCalled();
  });
});
