import { describe, it, expect } from 'vitest';
import {
  buildWindowName,
  parseWindowName,
  isForgeFrameWindow,
  isHostOfComponent,
  createWindowPayload,
  updateWindowName,
  getInitialPayload,
} from '@/window/name-payload';
import { WINDOW_NAME_PREFIX, VERSION, CONTEXT } from '@/constants';
import type { WindowNamePayload } from '@/types';

describe('buildWindowName', () => {
  it('should create window name with prefix', () => {
    const payload: WindowNamePayload<{ test: string }> = {
      uid: 'test-uid',
      tag: 'test-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: { test: 'value' },
      exports: {},
    };

    const name = buildWindowName(payload);

    expect(name).toMatch(new RegExp(`^${WINDOW_NAME_PREFIX}`));
  });

  it('should encode payload as base64', () => {
    const payload: WindowNamePayload<Record<string, never>> = {
      uid: 'test-uid',
      tag: 'test-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: {},
      exports: {},
    };

    const name = buildWindowName(payload);
    const encoded = name.slice(WINDOW_NAME_PREFIX.length);

    // Should be valid base64
    expect(() => atob(encoded)).not.toThrow();
  });

  it('should throw when payload exceeds the maximum size limit', () => {
    const payload: WindowNamePayload<{ oversized: string }> = {
      uid: 'oversized-uid',
      tag: 'oversized-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: { oversized: 'x'.repeat(70 * 1024) },
      exports: {},
    };

    expect(() => buildWindowName(payload)).toThrow(
      'exceeds maximum allowed size'
    );
  });

  it('should wrap encoding failures with a descriptive error', () => {
    const circular = {} as Record<string, unknown>;
    circular.self = circular;

    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'encode-failure-uid',
      tag: 'encode-failure-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: circular,
      exports: {},
    };

    expect(() => buildWindowName(payload)).toThrow('Failed to encode payload');
  });
});

describe('parseWindowName', () => {
  it('should parse valid window name', () => {
    const payload: WindowNamePayload<{ value: number }> = {
      uid: 'test-uid',
      tag: 'my-component',
      version: VERSION,
      context: CONTEXT.POPUP,
      consumerDomain: 'https://consumer.com',
      props: { value: 42 },
      exports: { close: true },
    };

    const name = buildWindowName(payload);
    const parsed = parseWindowName<{ value: number }>(name);

    expect(parsed).toEqual(payload);
  });

  it('should return null for non-ForgeFrame name', () => {
    expect(parseWindowName('some-other-name')).toBeNull();
    expect(parseWindowName('')).toBeNull();
  });

  it('should return null for invalid base64', () => {
    const invalidName = `${WINDOW_NAME_PREFIX}not-valid-base64!!!`;
    expect(parseWindowName(invalidName)).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    const invalidJson = `${WINDOW_NAME_PREFIX}${btoa('not json')}`;
    expect(parseWindowName(invalidJson)).toBeNull();
  });

  it('should handle unicode characters', () => {
    const payload: WindowNamePayload<{ message: string }> = {
      uid: 'test-uid',
      tag: 'test-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: { message: 'Hello World!' },
      exports: {},
    };

    const name = buildWindowName(payload);
    const parsed = parseWindowName<{ message: string }>(name);

    expect(parsed?.props.message).toBe('Hello World!');
  });
});

describe('isForgeFrameWindow', () => {
  it('should return true for ForgeFrame window', () => {
    const payload: WindowNamePayload<Record<string, never>> = {
      uid: 'test-uid',
      tag: 'test-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: {},
      exports: {},
    };

    const win = {
      name: buildWindowName(payload),
    } as Window;

    expect(isForgeFrameWindow(win)).toBe(true);
  });

  it('should return false for non-ForgeFrame window', () => {
    const win = { name: 'regular-window' } as Window;
    expect(isForgeFrameWindow(win)).toBe(false);
  });

  it('should return false for window with empty name', () => {
    const win = { name: '' } as Window;
    expect(isForgeFrameWindow(win)).toBe(false);
  });

  it('should return false on cross-origin error', () => {
    const win = {
      get name() {
        throw new Error('Cross-origin');
      },
    } as unknown as Window;

    expect(isForgeFrameWindow(win)).toBe(false);
  });
});

describe('isHostOfComponent', () => {
  it('should return true for matching tag', () => {
    const payload: WindowNamePayload<Record<string, never>> = {
      uid: 'test-uid',
      tag: 'my-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: {},
      exports: {},
    };

    const win = {
      name: buildWindowName(payload),
    } as Window;

    expect(isHostOfComponent('my-component', win)).toBe(true);
  });

  it('should return false for non-matching tag', () => {
    const payload: WindowNamePayload<Record<string, never>> = {
      uid: 'test-uid',
      tag: 'other-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: {},
      exports: {},
    };

    const win = {
      name: buildWindowName(payload),
    } as Window;

    expect(isHostOfComponent('my-component', win)).toBe(false);
  });

  it('should return false for non-ForgeFrame window', () => {
    const win = { name: 'regular-window' } as Window;
    expect(isHostOfComponent('my-component', win)).toBe(false);
  });
});

describe('createWindowPayload', () => {
  it('should create payload with version', () => {
    const payload = createWindowPayload<{ data: string }>({
      uid: 'test-uid',
      tag: 'test-tag',
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: { data: 'value' },
      exports: { close: true },
    });

    expect(payload.version).toBe(VERSION);
    expect(payload.uid).toBe('test-uid');
    expect(payload.tag).toBe('test-tag');
    expect(payload.context).toBe(CONTEXT.IFRAME);
    expect(payload.consumerDomain).toBe('https://consumer.com');
    expect(payload.props.data).toBe('value');
    expect(payload.exports.close).toBe(true);
  });

  it('should include children when provided', () => {
    const payload = createWindowPayload({
      uid: 'test-uid',
      tag: 'test-tag',
      context: CONTEXT.POPUP,
      consumerDomain: 'https://consumer.com',
      props: {},
      exports: {},
      children: {
        child1: { tag: 'child-component', url: 'https://example.com/child' },
      },
    });

    expect(payload.children).toEqual({
      child1: { tag: 'child-component', url: 'https://example.com/child' },
    });
  });
});

describe('updateWindowName', () => {
  it('should update window name with new payload', () => {
    const win = { name: '' } as Window;
    const payload: WindowNamePayload<Record<string, never>> = {
      uid: 'new-uid',
      tag: 'test-tag',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: {},
      exports: {},
    };

    updateWindowName(win, payload);

    expect(win.name.startsWith(WINDOW_NAME_PREFIX)).toBe(true);
    expect(parseWindowName(win.name)?.uid).toBe('new-uid');
  });

  it('should not throw on cross-origin error', () => {
    const win = {
      set name(_: string) {
        throw new Error('Cross-origin');
      },
    } as unknown as Window;

    const payload: WindowNamePayload<Record<string, never>> = {
      uid: 'test-uid',
      tag: 'test-tag',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: {},
      exports: {},
    };

    expect(() => updateWindowName(win, payload)).not.toThrow();
  });
});

describe('getInitialPayload', () => {
  it('should return payload from window name', () => {
    const originalPayload: WindowNamePayload<{ value: number }> = {
      uid: 'test-uid',
      tag: 'test-tag',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: { value: 123 },
      exports: {},
    };

    const win = {
      name: buildWindowName(originalPayload),
    } as Window;

    const payload = getInitialPayload<{ value: number }>(win);

    expect(payload).toEqual(originalPayload);
  });

  it('should return null for non-ForgeFrame window', () => {
    const win = { name: 'not-forgeframe' } as Window;
    expect(getInitialPayload(win)).toBeNull();
  });
});
