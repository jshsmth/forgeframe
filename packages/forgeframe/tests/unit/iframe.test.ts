/**
 * Unit tests for `@/render/iframe`.
 *
 * Covers iframe creation/destruction, visibility and sizing helpers, attribute handling, and same-origin dimension reads.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createIframe,
  createPrerenderIframe,
  destroyIframe,
  resizeIframe,
  showIframe,
  hideIframe,
  focusIframe,
  getIframeContentDimensions,
} from '@/render/iframe';

describe('createIframe', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('should create iframe with correct attributes', () => {
    const iframe = createIframe({
      url: 'https://example.com/widget',
      name: 'test-iframe',
      container,
      dimensions: { width: 400, height: 300 },
    });

    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.name).toBe('test-iframe');
    expect(iframe.src).toBe('https://example.com/widget');
    expect(iframe.style.width).toBe('400px');
    expect(iframe.style.height).toBe('300px');
  });

  it('should set default security attributes', () => {
    const iframe = createIframe({
      url: 'https://example.com',
      name: 'test-iframe',
      container,
      dimensions: { width: 100, height: 100 },
    });

    expect(iframe.getAttribute('frameborder')).toBe('0');
    expect(iframe.getAttribute('allowtransparency')).toBe('true');
    expect(iframe.getAttribute('scrolling')).toBe('auto');
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
    expect(iframe.getAttribute('sandbox')).toContain('allow-same-origin');
  });

  it('should apply custom attributes', () => {
    const iframe = createIframe({
      url: 'https://example.com',
      name: 'test-iframe',
      container,
      dimensions: { width: 100, height: 100 },
      attributes: {
        allow: 'payment',
        title: 'Payment Widget',
        sandbox: 'allow-scripts allow-forms',
      },
    });

    expect(iframe.getAttribute('allow')).toBe('payment');
    expect(iframe.getAttribute('title')).toBe('Payment Widget');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
  });

  it('should apply custom styles', () => {
    const iframe = createIframe({
      url: 'https://example.com',
      name: 'test-iframe',
      container,
      dimensions: { width: 100, height: 100 },
      style: {
        marginTop: 8,
        borderRadius: '12px',
      },
    });

    expect(iframe.style.getPropertyValue('margin-top')).toBe('8px');
    expect(iframe.style.getPropertyValue('border-radius')).toBe('12px');
  });

  it('should handle boolean attributes', () => {
    const iframe = createIframe({
      url: 'https://example.com',
      name: 'test-iframe',
      container,
      dimensions: { width: 100, height: 100 },
      attributes: {
        allowfullscreen: true,
      },
    });

    expect(iframe.hasAttribute('allowfullscreen')).toBe(true);
  });

  it('should skip undefined attributes', () => {
    const iframe = createIframe({
      url: 'https://example.com',
      name: 'test-iframe',
      container,
      dimensions: { width: 100, height: 100 },
      attributes: {
        title: undefined as unknown as string,
      },
    });

    expect(iframe.hasAttribute('title')).toBe(false);
  });

  it('should handle string dimensions', () => {
    const iframe = createIframe({
      url: 'https://example.com',
      name: 'test-iframe',
      container,
      dimensions: { width: '100%', height: 'auto' },
    });

    expect(iframe.style.width).toBe('100%');
    expect(iframe.style.height).toBe('auto');
  });

  it('should append iframe to container', () => {
    const iframe = createIframe({
      url: 'https://example.com',
      name: 'test-iframe',
      container,
      dimensions: { width: 100, height: 100 },
    });

    expect(container.contains(iframe)).toBe(true);
  });
});

describe('createPrerenderIframe', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('should create prerender iframe with srcdoc', () => {
    const iframe = createPrerenderIframe(container, { width: 200, height: 150 });

    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.name).toBe('__forgeframe_prerender__');
    expect(iframe.srcdoc).toContain('<!DOCTYPE html>');
  });

  it('should apply dimensions', () => {
    const iframe = createPrerenderIframe(container, { width: 200, height: 150 });

    expect(iframe.style.width).toBe('200px');
    expect(iframe.style.height).toBe('150px');
  });

  it('should set default attributes', () => {
    const iframe = createPrerenderIframe(container, { width: 100, height: 100 });

    expect(iframe.getAttribute('frameborder')).toBe('0');
    expect(iframe.getAttribute('allowtransparency')).toBe('true');
    expect(iframe.getAttribute('scrolling')).toBe('no');
  });
});

describe('destroyIframe', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('should remove iframe from DOM', () => {
    const iframe = createIframe({
      url: 'about:blank',
      name: 'test',
      container,
      dimensions: { width: 100, height: 100 },
    });

    expect(container.contains(iframe)).toBe(true);

    destroyIframe(iframe);

    expect(container.contains(iframe)).toBe(false);
  });

  it('should set src to about:blank', () => {
    const iframe = createIframe({
      url: 'https://example.com',
      name: 'test',
      container,
      dimensions: { width: 100, height: 100 },
    });

    destroyIframe(iframe);

    expect(iframe.src).toContain('about:blank');
  });

  it('should not throw for already removed iframe', () => {
    const iframe = document.createElement('iframe');
    // Not attached to DOM

    expect(() => destroyIframe(iframe)).not.toThrow();
  });
});

describe('resizeIframe', () => {
  it('should update iframe dimensions', () => {
    const iframe = document.createElement('iframe');
    iframe.style.width = '100px';
    iframe.style.height = '100px';

    resizeIframe(iframe, { width: 500, height: 400 });

    expect(iframe.style.width).toBe('500px');
    expect(iframe.style.height).toBe('400px');
  });

  it('should handle string dimensions', () => {
    const iframe = document.createElement('iframe');

    resizeIframe(iframe, { width: '80%', height: '50vh' });

    expect(iframe.style.width).toBe('80%');
    expect(iframe.style.height).toBe('50vh');
  });

  it('should handle partial dimensions', () => {
    const iframe = document.createElement('iframe');
    iframe.style.width = '100px';
    iframe.style.height = '100px';

    resizeIframe(iframe, { width: 200 });

    expect(iframe.style.width).toBe('200px');
    expect(iframe.style.height).toBe('100px');
  });
});

describe('showIframe', () => {
  it('should make iframe visible', () => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.style.visibility = 'hidden';

    showIframe(iframe);

    expect(iframe.style.display).toBe('');
    expect(iframe.style.visibility).toBe('visible');
  });
});

describe('hideIframe', () => {
  it('should hide iframe', () => {
    const iframe = document.createElement('iframe');
    iframe.style.display = '';
    iframe.style.visibility = 'visible';

    hideIframe(iframe);

    expect(iframe.style.display).toBe('none');
    expect(iframe.style.visibility).toBe('hidden');
  });
});

describe('focusIframe', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('should call focus on iframe', () => {
    const iframe = document.createElement('iframe');
    container.appendChild(iframe);
    const focusSpy = vi.spyOn(iframe, 'focus');

    focusIframe(iframe);

    expect(focusSpy).toHaveBeenCalled();
  });

  it('should not throw on cross-origin error', () => {
    const iframe = document.createElement('iframe');
    vi.spyOn(iframe, 'focus').mockImplementation(() => {
      throw new Error('Cross-origin');
    });

    expect(() => focusIframe(iframe)).not.toThrow();
  });
});

describe('getIframeContentDimensions', () => {
  it('should return null for cross-origin iframe', () => {
    const iframe = document.createElement('iframe');
    // contentDocument is null for cross-origin
    Object.defineProperty(iframe, 'contentDocument', {
      get() {
        return null;
      },
    });

    expect(getIframeContentDimensions(iframe)).toBeNull();
  });

  it('should return null when access throws', () => {
    const iframe = document.createElement('iframe');
    Object.defineProperty(iframe, 'contentDocument', {
      get() {
        throw new Error('Cross-origin');
      },
    });

    expect(getIframeContentDimensions(iframe)).toBeNull();
  });

  it('should return dimensions for same-origin iframe', () => {
    const iframe = document.createElement('iframe');

    const mockBody = {
      scrollWidth: 800,
      scrollHeight: 600,
      offsetWidth: 750,
      offsetHeight: 550,
    };

    const mockHtml = {
      clientWidth: 700,
      clientHeight: 500,
      scrollWidth: 800,
      scrollHeight: 600,
      offsetWidth: 780,
      offsetHeight: 580,
    };

    const mockDoc = {
      body: mockBody,
      documentElement: mockHtml,
    };

    Object.defineProperty(iframe, 'contentDocument', {
      get() {
        return mockDoc;
      },
    });

    const dimensions = getIframeContentDimensions(iframe);

    expect(dimensions).toEqual({
      width: 800, // max of all width values
      height: 600, // max of all height values
    });
  });
});
