/**
 * @vitest-environment node
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(async () => {
  const { clearComponents } = await import('@/core/component');
  clearComponents();
  vi.resetModules();
});

describe('Index node smoke', () => {
  it('should import the public entrypoint and define components without browser globals', async () => {
    expect('window' in globalThis).toBe(false);

    const { default: ForgeFrame } = await import('@/index');

    const AbsoluteUrlComponent = ForgeFrame.create({
      tag: 'node-absolute-component',
      url: 'https://example.com/host.html',
    });
    const RelativeUrlComponent = ForgeFrame.create({
      tag: 'node-relative-component',
      url: '/host.html',
    });

    expect(AbsoluteUrlComponent.isHost()).toBe(false);
    expect(AbsoluteUrlComponent.isEmbedded()).toBe(false);
    expect(RelativeUrlComponent.isHost()).toBe(false);
    expect(RelativeUrlComponent.isEmbedded()).toBe(false);
  });

  it('should reject malformed string urls without browser globals', async () => {
    const { default: ForgeFrame } = await import('@/index');

    expect(() =>
      ForgeFrame.create({
        tag: 'node-invalid-component',
        url: 'http://',
      })
    ).toThrow('Invalid component URL');
  });
});
