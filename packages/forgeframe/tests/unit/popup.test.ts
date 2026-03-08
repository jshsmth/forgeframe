/**
 * Unit tests for `#internal/render/popup`.
 *
 * Covers popup open/focus/close/resize utilities, popup-block detection, and close watcher polling behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  openPopup,
  closePopup,
  focusPopup,
  isPopupBlocked,
  watchPopupClose,
  resizePopup,
  PopupOpenError,
} from '#internal/render/popup';

describe('PopupOpenError', () => {
  it('should create error with default message', () => {
    const error = new PopupOpenError();

    expect(error.message).toBe('Popup blocked by browser');
    expect(error.name).toBe('PopupOpenError');
    expect(error instanceof Error).toBe(true);
  });

  it('should create error with custom message', () => {
    const error = new PopupOpenError('Custom popup error');

    expect(error.message).toBe('Custom popup error');
  });
});

describe('openPopup', () => {
  let originalOpen: typeof window.open;

  beforeEach(() => {
    originalOpen = window.open;
  });

  afterEach(() => {
    window.open = originalOpen;
  });

  it('should open popup with correct features', () => {
    const mockWin = {
      closed: false,
      innerWidth: 500,
      innerHeight: 600,
    } as Window;

    window.open = vi.fn().mockReturnValue(mockWin);

    const popup = openPopup({
      url: 'https://example.com',
      name: 'test-popup',
      dimensions: { width: 500, height: 600 },
    });

    expect(popup).toBe(mockWin);
    expect(window.open).toHaveBeenCalledWith(
      'https://example.com',
      'test-popup',
      expect.stringContaining('width=500')
    );
    expect(window.open).toHaveBeenCalledWith(
      'https://example.com',
      'test-popup',
      expect.stringContaining('height=600')
    );
  });

  it('should include security features', () => {
    const mockWin = {
      closed: false,
      innerWidth: 500,
      innerHeight: 600,
    } as Window;

    window.open = vi.fn().mockReturnValue(mockWin);

    openPopup({
      url: 'https://example.com',
      name: 'test-popup',
      dimensions: { width: 500, height: 600 },
    });

    const call = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
    const features = call[2] as string;

    expect(features).toContain('location=yes');
    expect(features).toContain('resizable=yes');
    expect(features).toContain('scrollbars=yes');
  });

  it('should throw PopupOpenError when popup is blocked', () => {
    window.open = vi.fn().mockReturnValue(null);

    expect(() =>
      openPopup({
        url: 'https://example.com',
        name: 'test-popup',
        dimensions: { width: 500, height: 600 },
      })
    ).toThrow(PopupOpenError);
  });

  it('should handle string dimensions', () => {
    const mockWin = {
      closed: false,
      innerWidth: 500,
      innerHeight: 600,
    } as Window;

    window.open = vi.fn().mockReturnValue(mockWin);

    openPopup({
      url: 'https://example.com',
      name: 'test-popup',
      dimensions: { width: '500px', height: '600px' },
    });

    const call = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
    const features = call[2] as string;

    expect(features).toContain('width=500');
    expect(features).toContain('height=600');
  });

  it('should use fallback for invalid dimensions', () => {
    const mockWin = {
      closed: false,
      innerWidth: 500,
      innerHeight: 500,
    } as Window;

    window.open = vi.fn().mockReturnValue(mockWin);

    openPopup({
      url: 'https://example.com',
      name: 'test-popup',
      dimensions: { width: 'invalid', height: 'invalid' },
    });

    const call = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
    const features = call[2] as string;

    // Should use fallback of 500
    expect(features).toContain('width=500');
    expect(features).toContain('height=500');
  });
});

describe('closePopup', () => {
  it('should close open popup', () => {
    const mockWin = {
      closed: false,
      close: vi.fn(),
    } as unknown as Window;

    closePopup(mockWin);

    expect(mockWin.close).toHaveBeenCalled();
  });

  it('should not call close on already closed popup', () => {
    const mockWin = {
      closed: true,
      close: vi.fn(),
    } as unknown as Window;

    closePopup(mockWin);

    expect(mockWin.close).not.toHaveBeenCalled();
  });

  it('should not throw when popup.close() throws due to access errors', () => {
    const mockWin = {
      closed: false,
      close: vi.fn().mockImplementation(() => {
        throw new Error('Access denied');
      }),
    } as unknown as Window;

    expect(() => closePopup(mockWin)).not.toThrow();
  });
});

describe('focusPopup', () => {
  it('should focus open popup', () => {
    const mockWin = {
      closed: false,
      focus: vi.fn(),
    } as unknown as Window;

    focusPopup(mockWin);

    expect(mockWin.focus).toHaveBeenCalled();
  });

  it('should not focus closed popup', () => {
    const mockWin = {
      closed: true,
      focus: vi.fn(),
    } as unknown as Window;

    focusPopup(mockWin);

    expect(mockWin.focus).not.toHaveBeenCalled();
  });

  it('should not throw when popup.focus() throws due to access errors', () => {
    const mockWin = {
      closed: false,
      focus: vi.fn().mockImplementation(() => {
        throw new Error('Access denied');
      }),
    } as unknown as Window;

    expect(() => focusPopup(mockWin)).not.toThrow();
  });
});

describe('isPopupBlocked', () => {
  it('should return true for null window', () => {
    expect(isPopupBlocked(null)).toBe(true);
  });

  it('should return true for closed window', () => {
    const mockWin = { closed: true } as Window;
    expect(isPopupBlocked(mockWin)).toBe(true);
  });

  it('should return true for zero-dimension window', () => {
    const mockWin = {
      closed: false,
      innerWidth: 0,
      innerHeight: 0,
    } as Window;

    expect(isPopupBlocked(mockWin)).toBe(true);
  });

  it('should return false for valid popup', () => {
    const mockWin = {
      closed: false,
      innerWidth: 500,
      innerHeight: 600,
    } as Window;

    expect(isPopupBlocked(mockWin)).toBe(false);
  });

  it('should return true when property access throws', () => {
    const mockWin = {
      get closed() {
        throw new Error('Access denied');
      },
    } as unknown as Window;

    expect(isPopupBlocked(mockWin)).toBe(true);
  });
});

describe('watchPopupClose', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call callback when popup closes', () => {
    const callback = vi.fn();
    let isClosed = false;
    const mockWin = {
      get closed() {
        return isClosed;
      },
    } as Window;

    watchPopupClose(mockWin, callback, { initialInterval: 100, maxInterval: 100, multiplier: 1 });

    // Not closed yet
    vi.advanceTimersByTime(100);
    expect(callback).not.toHaveBeenCalled();

    // Close popup
    isClosed = true;
    vi.advanceTimersByTime(100);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should return cleanup function', () => {
    const callback = vi.fn();
    const mockWin = { closed: false } as Window;

    const cleanup = watchPopupClose(mockWin, callback, { initialInterval: 100, maxInterval: 100, multiplier: 1 });
    cleanup();

    // Simulate popup closing after cleanup
    vi.advanceTimersByTime(500);

    expect(callback).not.toHaveBeenCalled();
  });

  it('should call callback on access error (window inaccessible)', () => {
    const callback = vi.fn();
    const mockWin = {
      get closed() {
        throw new Error('Cross-origin');
      },
    } as unknown as Window;

    watchPopupClose(mockWin, callback, { initialInterval: 100, maxInterval: 100, multiplier: 1 });

    vi.advanceTimersByTime(100);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should use default interval of 100ms (with exponential backoff)', () => {
    const callback = vi.fn();
    let isClosed = false;
    const mockWin = {
      get closed() {
        return isClosed;
      },
    } as Window;

    watchPopupClose(mockWin, callback);

    // Default is 100ms initial interval
    vi.advanceTimersByTime(50);
    expect(callback).not.toHaveBeenCalled();

    isClosed = true;
    vi.advanceTimersByTime(100);

    expect(callback).toHaveBeenCalled();
  });
});

describe('resizePopup', () => {
  it('should resize popup to new dimensions', () => {
    const mockWin = {
      outerWidth: 400,
      outerHeight: 300,
      resizeTo: vi.fn(),
    } as unknown as Window;

    resizePopup(mockWin, { width: 600, height: 500 });

    expect(mockWin.resizeTo).toHaveBeenCalledWith(600, 500);
  });

  it('should use current dimensions as fallback', () => {
    const mockWin = {
      outerWidth: 400,
      outerHeight: 300,
      resizeTo: vi.fn(),
    } as unknown as Window;

    resizePopup(mockWin, {});

    expect(mockWin.resizeTo).toHaveBeenCalledWith(400, 300);
  });

  it('should handle string dimensions', () => {
    const mockWin = {
      outerWidth: 400,
      outerHeight: 300,
      resizeTo: vi.fn(),
    } as unknown as Window;

    resizePopup(mockWin, { width: '800px', height: '600px' });

    expect(mockWin.resizeTo).toHaveBeenCalledWith(800, 600);
  });

  it('should not throw on resize error', () => {
    const mockWin = {
      outerWidth: 400,
      outerHeight: 300,
      resizeTo: vi.fn().mockImplementation(() => {
        throw new Error('Resize blocked');
      }),
    } as unknown as Window;

    expect(() => resizePopup(mockWin, { width: 600, height: 500 })).not.toThrow();
  });
});
