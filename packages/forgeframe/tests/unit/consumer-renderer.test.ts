import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTEXT } from '@/constants';
import { ConsumerRenderer } from '@/core/consumer/renderer';
import type { NormalizedOptions } from '@/core/consumer/types';

function createRenderer(
  options: Partial<NormalizedOptions<Record<string, unknown>>> = {}
): ConsumerRenderer<Record<string, unknown>> {
  const dimensions = { width: 320, height: 180 };
  const normalizedOptions: NormalizedOptions<Record<string, unknown>> = {
    tag: 'consumer-renderer-test',
    url: 'https://host.example.com/widget',
    props: {},
    defaultContext: CONTEXT.IFRAME,
    dimensions,
    timeout: 1000,
    ...options,
  };

  return new ConsumerRenderer(
    normalizedOptions,
    'renderer-test-uid',
    () => ({}),
    () => dimensions,
    {
      close: vi.fn().mockResolvedValue(undefined),
      focus: vi.fn().mockResolvedValue(undefined),
    }
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.getElementById('forgeframe-spinner-style')?.remove();
});

describe('ConsumerRenderer teardown', () => {
  it('should remove renderer-owned wrapper containers on destroy', async () => {
    const mountContainer = document.createElement('div');
    document.body.appendChild(mountContainer);

    const renderer = createRenderer();
    renderer.container = mountContainer;

    await renderer.prerender(
      (windowName) => renderer.createIframeElement(windowName),
      () => 'renderer-test-frame'
    );

    expect(
      mountContainer.querySelector('#forgeframe-container-renderer-test-uid')
    ).toBeInstanceOf(HTMLElement);

    renderer.destroy(null);

    expect(mountContainer.childElementCount).toBe(0);
    expect(
      mountContainer.querySelector('#forgeframe-container-renderer-test-uid')
    ).toBeNull();
    expect(renderer.container).toBeNull();
  });

  it('should preserve caller-owned containers on destroy', async () => {
    const mountContainer = document.createElement('div');
    document.body.appendChild(mountContainer);

    const renderer = createRenderer({
      containerTemplate: ({ container }) => container,
      prerenderTemplate: () => null,
    });
    renderer.container = mountContainer;

    await renderer.prerender(
      (windowName) => renderer.createIframeElement(windowName),
      () => 'renderer-test-frame'
    );

    expect(mountContainer.querySelector('iframe')).toBeInstanceOf(HTMLIFrameElement);

    renderer.destroy(null);

    expect(document.body.contains(mountContainer)).toBe(true);
    expect(mountContainer.childElementCount).toBe(0);
  });
});
