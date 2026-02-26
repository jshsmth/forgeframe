import { describe, it, expect, vi } from 'vitest';
import {
  getDomain,
  isSameDomain,
  matchDomain,
  isWindowClosed,
  getOpener,
  getConsumer,
  getTop,
  isIframe,
  isPopup,
  getAncestor,
  getDistanceToConsumer,
  focusWindow,
  closeWindow,
  getFrames,
} from '@/window/helpers';

describe('getDomain', () => {
  it('should return current window origin', () => {
    const domain = getDomain();
    expect(domain).toBe(window.location.origin);
  });

  it('should return empty string for cross-origin window', () => {
    const crossOriginWin = {
      get location() {
        throw new Error('Cross-origin access denied');
      },
    } as unknown as Window;

    expect(getDomain(crossOriginWin)).toBe('');
  });
});

describe('isSameDomain', () => {
  it('should return true for same origin', () => {
    expect(isSameDomain(window, window)).toBe(true);
  });

  it('should return false for cross-origin window', () => {
    const crossOriginWin = {
      get location() {
        throw new Error('Cross-origin access denied');
      },
    } as unknown as Window;

    expect(isSameDomain(crossOriginWin)).toBe(false);
  });
});

describe('matchDomain', () => {
  it('should match wildcard "*"', () => {
    expect(matchDomain('*', 'https://example.com')).toBe(true);
    expect(matchDomain('*', 'https://any.domain.com')).toBe(true);
  });

  it('should match exact string', () => {
    expect(matchDomain('https://example.com', 'https://example.com')).toBe(true);
    expect(matchDomain('https://example.com', 'https://other.com')).toBe(false);
  });

  it('should match wildcard string patterns', () => {
    expect(matchDomain('https://*.example.com', 'https://sub.example.com')).toBe(true);
    expect(matchDomain('https://api.*.example.com', 'https://api.us.example.com')).toBe(true);
    expect(matchDomain('https://*.example.com', 'https://example.com')).toBe(false);
    expect(matchDomain('https://*.example.com', 'https://evil.com')).toBe(false);
  });

  it('should match RegExp', () => {
    expect(matchDomain(/example\.com$/, 'https://example.com')).toBe(true);
    expect(matchDomain(/example\.com$/, 'https://sub.example.com')).toBe(true);
    expect(matchDomain(/example\.com$/, 'https://other.com')).toBe(false);
  });

  it('should match array of patterns (OR logic)', () => {
    const patterns = ['https://a.com', 'https://b.com'];

    expect(matchDomain(patterns, 'https://a.com')).toBe(true);
    expect(matchDomain(patterns, 'https://b.com')).toBe(true);
    expect(matchDomain(patterns, 'https://c.com')).toBe(false);
  });

  it('should handle mixed array patterns', () => {
    const patterns = ['https://exact.com', /\.trusted\.com$/];

    expect(matchDomain(patterns, 'https://exact.com')).toBe(true);
    expect(matchDomain(patterns, 'https://sub.trusted.com')).toBe(true);
    expect(matchDomain(patterns, 'https://untrusted.com')).toBe(false);
  });

  it('should return false for invalid pattern type', () => {
    expect(matchDomain(123 as unknown as string, 'https://example.com')).toBe(false);
  });
});

describe('isWindowClosed', () => {
  it('should return true for null window', () => {
    expect(isWindowClosed(null)).toBe(true);
  });

  it('should return false for open window', () => {
    const openWin = { closed: false } as Window;
    expect(isWindowClosed(openWin)).toBe(false);
  });

  it('should return true for closed window', () => {
    const closedWin = { closed: true } as Window;
    expect(isWindowClosed(closedWin)).toBe(true);
  });

  it('should return true when accessing closed throws', () => {
    const errorWin = {
      get closed() {
        throw new Error('Access denied');
      },
    } as unknown as Window;

    expect(isWindowClosed(errorWin)).toBe(true);
  });
});

describe('getOpener', () => {
  it('should return null for window without opener', () => {
    const win = { opener: null } as Window;
    expect(getOpener(win)).toBeNull();
  });

  it('should return opener when available', () => {
    const openerWin = {} as Window;
    const win = { opener: openerWin } as Window;
    expect(getOpener(win)).toBe(openerWin);
  });

  it('should return null on cross-origin error', () => {
    const win = {
      get opener() {
        throw new Error('Cross-origin');
      },
    } as unknown as Window;

    expect(getOpener(win)).toBeNull();
  });
});

describe('getConsumer', () => {
  it('should return null for top-level window', () => {
    const win = { parent: null } as unknown as Window;
    expect(getConsumer(win)).toBeNull();
  });

  it('should return null when parent is self', () => {
    const win = {} as Window;
    (win as { parent: Window }).parent = win;
    expect(getConsumer(win)).toBeNull();
  });

  it('should return consumer when in iframe', () => {
    const consumerWin = {} as Window;
    const win = { parent: consumerWin } as Window;
    expect(getConsumer(win)).toBe(consumerWin);
  });

  it('should return null on cross-origin error', () => {
    const win = {
      get parent() {
        throw new Error('Cross-origin');
      },
    } as unknown as Window;

    expect(getConsumer(win)).toBeNull();
  });
});

describe('getTop', () => {
  it('should return top window', () => {
    const topWin = {} as Window;
    const win = { top: topWin } as Window;
    expect(getTop(win)).toBe(topWin);
  });

  it('should return null on cross-origin error', () => {
    const win = {
      get top() {
        throw new Error('Cross-origin');
      },
    } as unknown as Window;

    expect(getTop(win)).toBeNull();
  });
});

describe('isIframe', () => {
  it('should return false for top-level window', () => {
    const win = {} as Window;
    (win as { parent: Window }).parent = win;
    expect(isIframe(win)).toBe(false);
  });

  it('should return true when in iframe', () => {
    const parentWin = {} as Window;
    const win = { parent: parentWin } as Window;
    expect(isIframe(win)).toBe(true);
  });

  it('should return true on cross-origin error (conservative)', () => {
    const win = {
      get parent() {
        throw new Error('Cross-origin');
      },
    } as unknown as Window;

    expect(isIframe(win)).toBe(true);
  });
});

describe('isPopup', () => {
  it('should return false for window without opener', () => {
    const win = { opener: null } as Window;
    expect(isPopup(win)).toBe(false);
  });

  it('should return true for popup with opener', () => {
    const openerWin = {} as Window;
    const win = { opener: openerWin } as Window;
    expect(isPopup(win)).toBe(true);
  });

  it('should return false on cross-origin error', () => {
    const win = {
      get opener() {
        throw new Error('Cross-origin');
      },
    } as unknown as Window;

    expect(isPopup(win)).toBe(false);
  });
});

describe('getAncestor', () => {
  it('should return null for distance 0', () => {
    const win = {} as Window;
    expect(getAncestor(win, 0)).toBe(win);
  });

  it('should return parent for distance 1', () => {
    const parentWin = {} as Window;
    (parentWin as { parent: Window }).parent = parentWin; // parent is itself (top)

    const win = { parent: parentWin } as Window;

    expect(getAncestor(win, 1)).toBe(parentWin);
  });

  it('should return grandparent for distance 2', () => {
    const grandparentWin = {} as Window;
    (grandparentWin as { parent: Window }).parent = grandparentWin;

    const parentWin = { parent: grandparentWin } as Window;
    const win = { parent: parentWin } as Window;

    expect(getAncestor(win, 2)).toBe(grandparentWin);
  });

  it('should return null if chain ends', () => {
    const win = {} as Window;
    (win as { parent: Window }).parent = win;

    expect(getAncestor(win, 5)).toBeNull();
  });
});

describe('getDistanceToConsumer', () => {
  it('should return 0 for same window', () => {
    const win = {} as Window;
    expect(getDistanceToConsumer(win, win)).toBe(0);
  });

  it('should return 1 for direct consumer', () => {
    const consumerWin = {} as Window;
    (consumerWin as { parent: Window }).parent = consumerWin;

    const win = { parent: consumerWin } as Window;

    expect(getDistanceToConsumer(win, consumerWin)).toBe(1);
  });

  it('should return -1 if consumer not found', () => {
    const win = {} as Window;
    (win as { parent: Window }).parent = win;

    const otherWin = {} as Window;

    expect(getDistanceToConsumer(win, otherWin)).toBe(-1);
  });
});

describe('focusWindow', () => {
  it('should call focus on window', () => {
    const win = { focus: vi.fn() } as unknown as Window;

    focusWindow(win);

    expect(win.focus).toHaveBeenCalled();
  });

  it('should not throw on cross-origin error', () => {
    const win = {
      focus() {
        throw new Error('Cross-origin');
      },
    } as unknown as Window;

    expect(() => focusWindow(win)).not.toThrow();
  });
});

describe('closeWindow', () => {
  it('should call close on window', () => {
    const win = { close: vi.fn() } as unknown as Window;

    closeWindow(win);

    expect(win.close).toHaveBeenCalled();
  });

  it('should not throw on cross-origin error', () => {
    const win = {
      close() {
        throw new Error('Cross-origin');
      },
    } as unknown as Window;

    expect(() => closeWindow(win)).not.toThrow();
  });
});

describe('getFrames', () => {
  it('should return empty array for window with no frames', () => {
    const win = { frames: { length: 0 } } as unknown as Window;

    expect(getFrames(win)).toEqual([]);
  });

  it('should return array of frames', () => {
    const frame1 = {} as Window;
    const frame2 = {} as Window;
    const win = {
      frames: {
        length: 2,
        0: frame1,
        1: frame2,
      },
    } as unknown as Window;

    const frames = getFrames(win);

    expect(frames).toHaveLength(2);
    expect(frames[0]).toBe(frame1);
    expect(frames[1]).toBe(frame2);
  });

  it('should return empty array on cross-origin error', () => {
    const win = {
      get frames() {
        throw new Error('Cross-origin');
      },
    } as unknown as Window;

    expect(getFrames(win)).toEqual([]);
  });
});
