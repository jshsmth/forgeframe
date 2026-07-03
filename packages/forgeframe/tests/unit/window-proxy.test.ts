/**
 * Unit tests for window reference registry/proxy helpers in `@/window/proxy`.
 *
 * Covers registry capacity behavior, reference creation/resolution, and serialization constraints across reference types.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  registerWindow,
  unregisterWindow,
  getWindowByUID,
  createWindowRef,
  resolveWindowRef,
  serializeWindowRef,
  clearWindowRegistry,
} from '@/window/proxy';
import type { WindowRef } from '@/window/types';

describe('Window Registry', () => {
  beforeEach(() => {
    clearWindowRegistry();
  });

  afterEach(() => {
    clearWindowRegistry();
  });

  describe('registerWindow', () => {
    it('should register a window with a UID', () => {
      const mockWindow = {} as Window;
      registerWindow('test-uid-123', mockWindow);

      const retrieved = getWindowByUID('test-uid-123');
      expect(retrieved).toBe(mockWindow);
    });

    it('should overwrite existing registration with same UID', () => {
      const mockWindow1 = { id: 1 } as unknown as Window;
      const mockWindow2 = { id: 2 } as unknown as Window;

      registerWindow('same-uid', mockWindow1);
      registerWindow('same-uid', mockWindow2);

      const retrieved = getWindowByUID('same-uid');
      expect(retrieved).toBe(mockWindow2);
    });

    it('should cleanup closed windows when registry reaches capacity', () => {
      for (let i = 0; i < 99; i++) {
        registerWindow(`open-${i}`, { closed: false } as unknown as Window);
      }
      registerWindow('closed-window', { closed: true } as unknown as Window);

      registerWindow('new-window', { closed: false } as unknown as Window);

      expect(getWindowByUID('closed-window')).toBeNull();
      expect(getWindowByUID('new-window')).toBeDefined();
      expect(getWindowByUID('open-0')).toBeDefined();
    });

    it('should evict oldest entry when registry stays full after cleanup', () => {
      for (let i = 0; i < 100; i++) {
        registerWindow(`uid-${i}`, { closed: false } as unknown as Window);
      }

      registerWindow('overflow', { closed: false } as unknown as Window);

      expect(getWindowByUID('uid-0')).toBeNull();
      expect(getWindowByUID('uid-1')).toBeDefined();
      expect(getWindowByUID('overflow')).toBeDefined();
    });
  });

  describe('unregisterWindow', () => {
    it('should remove a registered window', () => {
      const mockWindow = {} as Window;
      registerWindow('to-remove', mockWindow);

      expect(getWindowByUID('to-remove')).toBe(mockWindow);

      unregisterWindow('to-remove');

      expect(getWindowByUID('to-remove')).toBeNull();
    });

    it('should not throw when unregistering non-existent UID', () => {
      expect(() => unregisterWindow('non-existent')).not.toThrow();
    });
  });

  describe('getWindowByUID', () => {
    it('should return null for non-existent UID', () => {
      expect(getWindowByUID('does-not-exist')).toBeNull();
    });

    it('should return registered window', () => {
      const mockWindow = { test: true } as unknown as Window;
      registerWindow('existing', mockWindow);

      expect(getWindowByUID('existing')).toBe(mockWindow);
    });
  });

  describe('clearWindowRegistry', () => {
    it('should remove all registered windows', () => {
      registerWindow('uid1', {} as Window);
      registerWindow('uid2', {} as Window);
      registerWindow('uid3', {} as Window);

      clearWindowRegistry();

      expect(getWindowByUID('uid1')).toBeNull();
      expect(getWindowByUID('uid2')).toBeNull();
      expect(getWindowByUID('uid3')).toBeNull();
    });
  });
});

describe('Window References', () => {
  beforeEach(() => {
    clearWindowRegistry();
  });

  afterEach(() => {
    clearWindowRegistry();
    vi.restoreAllMocks();
  });

  describe('createWindowRef', () => {
    it('should create opener reference when target is opener', () => {
      const mockOpener = { isOpener: true } as unknown as Window;
      const mockSource = {
        opener: mockOpener,
        parent: null,
      } as unknown as Window;

      const ref = createWindowRef(mockOpener, mockSource);

      expect(ref).toEqual({ type: 'opener' });
    });

    it('should create parent reference with distance 1 for immediate parent', () => {
      const mockParent = { isParent: true } as unknown as Window;
      const mockSource = {
        opener: null,
        parent: mockParent,
      } as unknown as Window;

      // Mock parent having no further parent
      Object.defineProperty(mockParent, 'parent', { value: mockParent });

      const ref = createWindowRef(mockParent, mockSource);

      expect(ref).toEqual({ type: 'parent', distance: 1 });
    });

    it('should create direct reference when not opener or parent', () => {
      const mockTarget = { isTarget: true } as unknown as Window;
      const mockSource = {
        opener: null,
      } as unknown as Window;

      // Set parent to itself (top-level window behavior)
      Object.defineProperty(mockSource, 'parent', { value: mockSource });

      const ref = createWindowRef(mockTarget, mockSource);

      expect(ref).toEqual({ type: 'direct', win: mockTarget });
    });

    it('should include correct parent distance for nested ancestors', () => {
      const target = { id: 'target' } as unknown as Window;
      const middle = {
        parent: target,
      } as unknown as Window;
      const source = {
        opener: null,
        parent: middle,
      } as unknown as Window;
      Object.defineProperty(target, 'parent', { value: target });

      const ref = createWindowRef(target, source);

      expect(ref).toEqual({ type: 'parent', distance: 2 });
    });

    it('should fall back to direct ref after ancestor traversal safety limit', () => {
      const target = { id: 'target' } as unknown as Window;
      const frameA = {} as { parent: Window };
      const frameB = {} as { parent: Window };
      frameA.parent = frameB as unknown as Window;
      frameB.parent = frameA as unknown as Window;

      const source = {
        opener: null,
        parent: frameA as unknown as Window,
      } as unknown as Window;

      const ref = createWindowRef(target, source);

      expect(ref).toEqual({ type: 'direct', win: target });
    });
  });

  describe('resolveWindowRef', () => {
    it('should resolve opener reference', () => {
      const mockOpener = { isOpener: true } as unknown as Window;
      const mockSource = {
        opener: mockOpener,
      } as unknown as Window;

      const ref: WindowRef = { type: 'opener' };
      const resolved = resolveWindowRef(ref, mockSource);

      expect(resolved).toBe(mockOpener);
    });

    it('should resolve parent reference by ancestor distance', () => {
      const grandparent = { id: 'grandparent' } as unknown as Window;
      const parent = {
        parent: grandparent,
      } as unknown as Window;
      const source = {
        parent,
      } as unknown as Window;
      Object.defineProperty(grandparent, 'parent', { value: grandparent });

      const ref: WindowRef = { type: 'parent', distance: 2 };
      const resolved = resolveWindowRef(ref, source);

      expect(resolved).toBe(grandparent);
    });

    it('should resolve global reference from registry', () => {
      const mockWindow = { isGlobal: true } as unknown as Window;
      registerWindow('global-uid', mockWindow);

      const ref: WindowRef = { type: 'global', uid: 'global-uid' };
      const resolved = resolveWindowRef(ref);

      expect(resolved).toBe(mockWindow);
    });

    it('should return null for non-existent global reference', () => {
      const ref: WindowRef = { type: 'global', uid: 'non-existent' };
      const resolved = resolveWindowRef(ref);

      expect(resolved).toBeNull();
    });

    it('should resolve direct reference', () => {
      const mockWindow = { isDirect: true } as unknown as Window;
      const ref: WindowRef = { type: 'direct', win: mockWindow };

      const resolved = resolveWindowRef(ref);

      expect(resolved).toBe(mockWindow);
    });

    it('should return null for unknown reference type', () => {
      const ref = { type: 'unknown' } as unknown as WindowRef;
      const resolved = resolveWindowRef(ref);

      expect(resolved).toBeNull();
    });
  });

  describe('serializeWindowRef', () => {
    it('should serialize opener reference', () => {
      const ref: WindowRef = { type: 'opener' };
      const serialized = serializeWindowRef(ref);

      expect(serialized).toEqual({ type: 'opener' });
    });

    it('should serialize parent reference', () => {
      const ref: WindowRef = { type: 'parent', distance: 2 };
      const serialized = serializeWindowRef(ref);

      expect(serialized).toEqual({ type: 'parent', distance: 2 });
    });

    it('should serialize global reference', () => {
      const ref: WindowRef = { type: 'global', uid: 'my-uid' };
      const serialized = serializeWindowRef(ref);

      expect(serialized).toEqual({ type: 'global', uid: 'my-uid' });
    });

    it('should throw when serializing direct reference', () => {
      const ref: WindowRef = { type: 'direct', win: {} as Window };

      expect(() => serializeWindowRef(ref)).toThrow(
        'Cannot serialize direct window reference'
      );
    });
  });
});
