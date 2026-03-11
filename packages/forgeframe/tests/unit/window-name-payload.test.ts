/**
 * Unit tests for window name payload helpers in `@/window/name-payload`.
 *
 * Covers payload encoding/parsing, ForgeFrame window detection, payload mutation helpers, and size/error guardrails.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildWindowName,
  parseWindowName,
  isForgeFrameWindow,
  isHostOfComponent,
  createWindowPayload,
  updateWindowName,
  getInitialPayload,
} from '@/window/name-payload';
import { WINDOW_NAME_PREFIX, VERSION, CONTEXT, MESSAGE_NAME } from '@/constants';
import type { ConsumerExports, WindowNamePayload } from '@/types';

const VALID_EXPORTS: ConsumerExports = {
  init: MESSAGE_NAME.INIT,
  close: MESSAGE_NAME.CLOSE,
  resize: MESSAGE_NAME.RESIZE,
  show: MESSAGE_NAME.SHOW,
  hide: MESSAGE_NAME.HIDE,
  onError: MESSAGE_NAME.ERROR,
  updateProps: MESSAGE_NAME.PROPS,
  export: MESSAGE_NAME.EXPORT,
};

describe('buildWindowName', () => {
  it('should create window name with prefix', () => {
    const payload: WindowNamePayload<{ test: string }> = {
      uid: 'test-uid',
      tag: 'test-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: { test: 'value' },
      exports: VALID_EXPORTS,
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
      exports: VALID_EXPORTS,
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
      exports: VALID_EXPORTS,
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
      exports: VALID_EXPORTS,
    };

    expect(() => buildWindowName(payload)).toThrow('Failed to encode payload');
  });

  it('should not depend on Blob when measuring encoded payload size', () => {
    vi.stubGlobal(
      'Blob',
      class {
        constructor() {
          throw new Error('Blob should not be used for payload size checks');
        }
      }
    );

    try {
      const payload: WindowNamePayload<{ test: string }> = {
        uid: 'test-uid',
        tag: 'test-component',
        version: VERSION,
        context: CONTEXT.IFRAME,
        consumerDomain: 'https://consumer.com',
        props: { test: 'value' },
        exports: VALID_EXPORTS,
      };

      expect(() => buildWindowName(payload)).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
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
      exports: VALID_EXPORTS,
    };

    const name = buildWindowName(payload);
    const parsed = parseWindowName<{ value: number }>(name);

    expect(parsed).toEqual(payload);
  });

  it('should parse valid payloads with child host references', () => {
    const payload: WindowNamePayload<Record<string, never>> = {
      uid: 'test-uid',
      tag: 'my-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: {},
      exports: VALID_EXPORTS,
      children: {
        Child: {
          tag: 'child-component',
          url: 'https://example.com/child',
          props: {
            amount: { __type__: 'prop' },
          } as Record<string, unknown>,
          defaultContext: CONTEXT.POPUP,
          dimensions: {
            width: 320,
            height: '240px',
          },
        },
      },
    };

    const parsed = parseWindowName<Record<string, never>>(buildWindowName(payload));

    expect(parsed).toEqual(payload);
  });

  it('should parse valid child host references without dimensions metadata', () => {
    const payload: WindowNamePayload<Record<string, never>> = {
      uid: 'test-uid',
      tag: 'my-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: {},
      exports: VALID_EXPORTS,
      children: {
        Child: {
          tag: 'child-component',
          url: 'https://example.com/child',
          props: {
            amount: { __type__: 'prop' },
          } as Record<string, unknown>,
          defaultContext: CONTEXT.IFRAME,
        },
      },
    };

    const parsed = parseWindowName<Record<string, never>>(buildWindowName(payload));

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

  it('should return null for payloads with an invalid structure', () => {
    const malformedPayload = {
      uid: 'test-uid',
      tag: 'test-component',
      version: VERSION,
      context: 'modal',
      consumerDomain: 'https://consumer.com',
      props: {},
      exports: VALID_EXPORTS,
    };

    const malformedName = `${WINDOW_NAME_PREFIX}${btoa(
      encodeURIComponent(JSON.stringify(malformedPayload))
    )}`;

    expect(parseWindowName(malformedName)).toBeNull();
  });

  it('should return null for payloads with an unsupported version', () => {
    const malformedPayload = {
      uid: 'test-uid',
      tag: 'test-component',
      version: '999.0.0',
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: {},
      exports: VALID_EXPORTS,
    };

    const malformedName = `${WINDOW_NAME_PREFIX}${btoa(
      encodeURIComponent(JSON.stringify(malformedPayload))
    )}`;

    expect(parseWindowName(malformedName)).toBeNull();
  });

  it('should return null for payloads with invalid exports metadata', () => {
    const malformedPayload = {
      uid: 'test-uid',
      tag: 'test-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: {},
      exports: { close: true },
    };

    const malformedName = `${WINDOW_NAME_PREFIX}${btoa(
      encodeURIComponent(JSON.stringify(malformedPayload))
    )}`;

    expect(parseWindowName(malformedName)).toBeNull();
  });

  it('should round-trip real non-ASCII payload values', () => {
    const payload: WindowNamePayload<{ message: string }> = {
      uid: 'test-uid',
      tag: 'test-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.com',
      props: { message: 'Héllo 世界 👋 café' },
      exports: VALID_EXPORTS,
    };

    const name = buildWindowName(payload);
    const parsed = parseWindowName<{ message: string }>(name);

    expect(parsed).toEqual(payload);
    expect(parsed?.props.message).toBe('Héllo 世界 👋 café');
  });

  it.each([
    [
      'non-object payload root',
      'invalid-root',
    ],
    [
      'empty uid',
      {
        uid: '',
        tag: 'test-component',
        version: VERSION,
        context: CONTEXT.IFRAME,
        consumerDomain: 'https://consumer.com',
        props: {},
        exports: VALID_EXPORTS,
      },
    ],
    [
      'empty version',
      {
        uid: 'test-uid',
        tag: 'test-component',
        version: '',
        context: CONTEXT.IFRAME,
        consumerDomain: 'https://consumer.com',
        props: {},
        exports: VALID_EXPORTS,
      },
    ],
    [
      'empty consumer domain',
      {
        uid: 'test-uid',
        tag: 'test-component',
        version: VERSION,
        context: CONTEXT.IFRAME,
        consumerDomain: '',
        props: {},
        exports: VALID_EXPORTS,
      },
    ],
    [
      'non-object children map',
      {
        uid: 'test-uid',
        tag: 'test-component',
        version: VERSION,
        context: CONTEXT.IFRAME,
        consumerDomain: 'https://consumer.com',
        props: {},
        exports: VALID_EXPORTS,
        children: 'invalid-children',
      },
    ],
    [
      'child entry that is not an object',
      {
        uid: 'test-uid',
        tag: 'test-component',
        version: VERSION,
        context: CONTEXT.IFRAME,
        consumerDomain: 'https://consumer.com',
        props: {},
        exports: VALID_EXPORTS,
        children: {
          BrokenChild: 'invalid-child',
        },
      },
    ],
    [
      'child with invalid default context',
      {
        uid: 'test-uid',
        tag: 'test-component',
        version: VERSION,
        context: CONTEXT.IFRAME,
        consumerDomain: 'https://consumer.com',
        props: {},
        exports: VALID_EXPORTS,
        children: {
          BrokenChild: {
            tag: 'child-component',
            url: 'https://example.com/child',
            defaultContext: 'modal',
          },
        },
      },
    ],
    [
      'child with empty tag',
      {
        uid: 'test-uid',
        tag: 'test-component',
        version: VERSION,
        context: CONTEXT.IFRAME,
        consumerDomain: 'https://consumer.com',
        props: {},
        exports: VALID_EXPORTS,
        children: {
          BrokenChild: {
            tag: '',
            url: 'https://example.com/child',
          },
        },
      },
    ],
    [
      'child with empty url',
      {
        uid: 'test-uid',
        tag: 'test-component',
        version: VERSION,
        context: CONTEXT.IFRAME,
        consumerDomain: 'https://consumer.com',
        props: {},
        exports: VALID_EXPORTS,
        children: {
          BrokenChild: {
            tag: 'child-component',
            url: '',
          },
        },
      },
    ],
    [
      'child with non-object dimensions metadata',
      {
        uid: 'test-uid',
        tag: 'test-component',
        version: VERSION,
        context: CONTEXT.IFRAME,
        consumerDomain: 'https://consumer.com',
        props: {},
        exports: VALID_EXPORTS,
        children: {
          BrokenChild: {
            tag: 'child-component',
            url: 'https://example.com/child',
            dimensions: 'wide',
          },
        },
      },
    ],
    [
      'child with invalid dimension type',
      {
        uid: 'test-uid',
        tag: 'test-component',
        version: VERSION,
        context: CONTEXT.IFRAME,
        consumerDomain: 'https://consumer.com',
        props: {},
        exports: VALID_EXPORTS,
        children: {
          BrokenChild: {
            tag: 'child-component',
            url: 'https://example.com/child',
            dimensions: {
              width: true,
            },
          },
        },
      },
    ],
    [
      'child with invalid height dimension type',
      {
        uid: 'test-uid',
        tag: 'test-component',
        version: VERSION,
        context: CONTEXT.IFRAME,
        consumerDomain: 'https://consumer.com',
        props: {},
        exports: VALID_EXPORTS,
        children: {
          BrokenChild: {
            tag: 'child-component',
            url: 'https://example.com/child',
            dimensions: {
              width: '320px',
              height: false,
            },
          },
        },
      },
    ],
    [
      'child with non-object props metadata',
      {
        uid: 'test-uid',
        tag: 'test-component',
        version: VERSION,
        context: CONTEXT.IFRAME,
        consumerDomain: 'https://consumer.com',
        props: {},
        exports: VALID_EXPORTS,
        children: {
          BrokenChild: {
            tag: 'child-component',
            url: 'https://example.com/child',
            props: 'invalid-props',
          },
        },
      },
    ],
  ])('should reject prefixed payloads with %s', (_label, malformedPayload) => {
    const malformedName = `${WINDOW_NAME_PREFIX}${btoa(
      encodeURIComponent(JSON.stringify(malformedPayload))
    )}`;

    expect(parseWindowName(malformedName)).toBeNull();
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
      exports: VALID_EXPORTS,
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
      exports: VALID_EXPORTS,
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
      exports: VALID_EXPORTS,
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

  it('should return false for prefixed windows with invalid payloads', () => {
    const invalidPrefixedWindow = {
      name: `${WINDOW_NAME_PREFIX}${btoa(
        encodeURIComponent(
          JSON.stringify({
            uid: 'test-uid',
            tag: '',
            version: VERSION,
            context: CONTEXT.IFRAME,
            consumerDomain: 'https://consumer.com',
            props: {},
            exports: VALID_EXPORTS,
          })
        )
      )}`,
    } as Window;

    expect(isHostOfComponent('my-component', invalidPrefixedWindow)).toBe(false);
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
      exports: VALID_EXPORTS,
    });

    expect(payload.version).toBe(VERSION);
    expect(payload.uid).toBe('test-uid');
    expect(payload.tag).toBe('test-tag');
    expect(payload.context).toBe(CONTEXT.IFRAME);
    expect(payload.consumerDomain).toBe('https://consumer.com');
    expect(payload.props.data).toBe('value');
    expect(payload.exports.close).toBe(MESSAGE_NAME.CLOSE);
  });

  it('should include children when provided', () => {
    const payload = createWindowPayload({
      uid: 'test-uid',
      tag: 'test-tag',
      context: CONTEXT.POPUP,
      consumerDomain: 'https://consumer.com',
      props: {},
      exports: VALID_EXPORTS,
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
      exports: VALID_EXPORTS,
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
      exports: VALID_EXPORTS,
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
      exports: VALID_EXPORTS,
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
