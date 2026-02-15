import { describe, it, expect, afterEach } from 'vitest';
import { initHost, clearHostInstance } from '@/core/host';
import { buildWindowName } from '@/window/name-payload';
import { CONTEXT, VERSION } from '@/constants';
import type { WindowNamePayload } from '@/types';

const originalWindowName = window.name;

afterEach(() => {
  clearHostInstance();
  window.name = originalWindowName;
});

describe('Host security', () => {
  it('should reject disallowed consumer domains during host initialization', () => {
    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'host-uid',
      tag: 'secure-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://evil.example.com',
      props: {},
      exports: {},
    };

    window.name = buildWindowName(payload);

    expect(() => initHost({}, 'https://trusted.example.com')).toThrow(
      'is not allowed'
    );
  });
});
