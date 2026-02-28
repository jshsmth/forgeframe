import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Messenger } from '@/communication/messenger';
import {
  serializeMessage,
  createRequestMessage,
  createResponseMessage,
} from '@/communication/protocol';
import { MESSAGE_TYPE } from '@/constants';

describe('Messenger', () => {
  let messenger: Messenger;
  let mockWindow: Window;
  let messageListeners: Set<(event: MessageEvent) => void>;

  beforeEach(() => {
    messageListeners = new Set();

    mockWindow = {
      addEventListener: vi.fn((event: string, listener: (event: MessageEvent) => void) => {
        if (event === 'message') {
          messageListeners.add(listener);
        }
      }),
      removeEventListener: vi.fn((event: string, listener: (event: MessageEvent) => void) => {
        if (event === 'message') {
          messageListeners.delete(listener);
        }
      }),
      location: { origin: 'https://consumer.com' },
    } as unknown as Window;

    // Create messenger with trusted domains for testing
    messenger = new Messenger('test-uid', mockWindow, 'https://consumer.com', [
      'https://host.com',
      'https://target.com',
      'https://sender.com',
      'https://example.com',
    ]);
  });

  afterEach(() => {
    messenger.destroy();
  });

  function dispatchMessage(data: unknown, source: Window = {} as Window, origin = 'https://host.com') {
    const event = new MessageEvent('message', {
      data,
      source,
      origin,
    });

    for (const listener of messageListeners) {
      listener(event);
    }
  }

  describe('constructor', () => {
    it('should setup message listener', () => {
      expect(mockWindow.addEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function)
      );
    });
  });

  describe('send', () => {
    let targetWindow: Window;

    beforeEach(() => {
      targetWindow = {
        postMessage: vi.fn(),
      } as unknown as Window;
    });

    it('should send message via postMessage', async () => {
      vi.useFakeTimers();

      const sendPromise = messenger.send(
        targetWindow,
        'https://target.com',
        'greeting',
        { name: 'World' }
      );

      expect(targetWindow.postMessage).toHaveBeenCalledWith(
        expect.stringContaining('forgeframe:'),
        'https://target.com'
      );

      // Simulate response
      const sentMessage = JSON.parse(
        (targetWindow.postMessage as ReturnType<typeof vi.fn>).mock.calls[0][0].slice('forgeframe:'.length)
      );

      const response = createResponseMessage(
        sentMessage.id,
        { greeting: 'Hello, World!' },
        { uid: 'target-uid', domain: 'https://target.com' }
      );

      dispatchMessage(serializeMessage(response), targetWindow);

      const result = await sendPromise;
      expect(result).toEqual({ greeting: 'Hello, World!' });

      vi.useRealTimers();
    });

    it('should timeout if no response', async () => {
      vi.useFakeTimers();

      const sendPromise = messenger.send(
        targetWindow,
        'https://target.com',
        'test',
        {},
        100
      );

      vi.advanceTimersByTime(100);

      await expect(sendPromise).rejects.toThrow('timed out');

      vi.useRealTimers();
    });

    it('should throw if messenger is destroyed', async () => {
      messenger.destroy();

      await expect(
        messenger.send(targetWindow, 'https://target.com', 'test')
      ).rejects.toThrow('Messenger has been destroyed');
    });

    it('should propagate errors from response', async () => {
      vi.useFakeTimers();

      const sendPromise = messenger.send(
        targetWindow,
        'https://target.com',
        'errorTest'
      );

      const sentMessage = JSON.parse(
        (targetWindow.postMessage as ReturnType<typeof vi.fn>).mock.calls[0][0].slice('forgeframe:'.length)
      );

      const response = createResponseMessage(
        sentMessage.id,
        null,
        { uid: 'target-uid', domain: 'https://target.com' },
        new Error('Handler failed')
      );

      dispatchMessage(serializeMessage(response), targetWindow);

      await expect(sendPromise).rejects.toThrow('Handler failed');

      vi.useRealTimers();
    });
  });

  describe('post', () => {
    it('should send one-way message without waiting', () => {
      const targetWindow = {
        postMessage: vi.fn(),
      } as unknown as Window;

      messenger.post(targetWindow, 'https://target.com', 'notify', { event: 'update' });

      expect(targetWindow.postMessage).toHaveBeenCalledWith(
        expect.stringContaining('forgeframe:'),
        'https://target.com'
      );
    });

    it('should throw if messenger is destroyed', () => {
      messenger.destroy();

      const targetWindow = {
        postMessage: vi.fn(),
      } as unknown as Window;

      expect(() =>
        messenger.post(targetWindow, 'https://target.com', 'test')
      ).toThrow('Messenger has been destroyed');
    });
  });

  describe('on', () => {
    it('should register handler for message type', async () => {
      const handler = vi.fn().mockReturnValue({ result: 'ok' });

      messenger.on('testMessage', handler);

      const targetWindow = {
        postMessage: vi.fn(),
      } as unknown as Window;

      const request = createRequestMessage('req-1', 'testMessage', { input: 'data' }, {
        uid: 'sender-uid',
        domain: 'https://sender.com',
      });

      dispatchMessage(serializeMessage(request), targetWindow, 'https://sender.com');

      // Allow async handler to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalledWith(
        { input: 'data' },
        { uid: 'sender-uid', domain: 'https://sender.com' }
      );
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();

      const unsubscribe = messenger.on('testMessage', handler);
      unsubscribe();

      const targetWindow = {} as Window;
      const request = createRequestMessage('req-1', 'testMessage', {}, {
        uid: 'uid',
        domain: 'https://example.com',
      });

      dispatchMessage(serializeMessage(request), targetWindow);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should send response back to source', async () => {
      const handler = vi.fn().mockReturnValue({ response: 'data' });

      messenger.on('testMessage', handler);

      const targetWindow = {
        postMessage: vi.fn(),
      } as unknown as Window;

      const request = createRequestMessage('req-1', 'testMessage', {}, {
        uid: 'sender-uid',
        domain: 'https://sender.com',
      });

      dispatchMessage(serializeMessage(request), targetWindow, 'https://sender.com');

      // Allow async handler to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(targetWindow.postMessage).toHaveBeenCalledWith(
        expect.stringContaining('forgeframe:'),
        'https://sender.com'
      );

      // Parse the response
      const responseStr = (targetWindow.postMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const responseData = JSON.parse(responseStr.slice('forgeframe:'.length));

      expect(responseData.type).toBe(MESSAGE_TYPE.RESPONSE);
      expect(responseData.data).toEqual({ response: 'data' });
    });

    it('should send error response on handler failure', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Handler error'));

      messenger.on('testMessage', handler);

      const targetWindow = {
        postMessage: vi.fn(),
      } as unknown as Window;

      const request = createRequestMessage('req-1', 'testMessage', {}, {
        uid: 'sender-uid',
        domain: 'https://sender.com',
      });

      dispatchMessage(serializeMessage(request), targetWindow, 'https://sender.com');

      // Allow async handler to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      const responseStr = (targetWindow.postMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const responseData = JSON.parse(responseStr.slice('forgeframe:'.length));

      expect(responseData.error).toBeDefined();
      expect(responseData.error.message).toBe('Handler error');
    });
  });

  describe('message filtering', () => {
    it('should ignore messages from same window', () => {
      const handler = vi.fn();
      messenger.on('test', handler);

      const request = createRequestMessage('req-1', 'test', {}, {
        uid: 'uid',
        domain: 'https://example.com',
      });

      // Source is the same as messenger window
      dispatchMessage(serializeMessage(request), mockWindow);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should ignore non-ForgeFrame messages', () => {
      const handler = vi.fn();
      messenger.on('test', handler);

      dispatchMessage('not a forgeframe message', {} as Window);
      dispatchMessage({ type: 'other' }, {} as Window);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should ignore messages without handlers', async () => {
      const targetWindow = {
        postMessage: vi.fn(),
      } as unknown as Window;

      const request = createRequestMessage('req-1', 'unknownMessage', {}, {
        uid: 'uid',
        domain: 'https://example.com',
      });

      dispatchMessage(serializeMessage(request), targetWindow);

      // Allow async processing
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Should not send any response for unknown message
      expect(targetWindow.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('origin validation', () => {
    it('should reject messages from untrusted origins', async () => {
      const handler = vi.fn();
      messenger.on('test', handler);

      const request = createRequestMessage('req-1', 'test', { data: 'value' }, {
        uid: 'malicious-uid',
        domain: 'https://malicious.com',
      });

      // Dispatch from an untrusted origin
      dispatchMessage(serializeMessage(request), {} as Window, 'https://malicious.com');

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Handler should NOT be called for untrusted origin
      expect(handler).not.toHaveBeenCalled();
    });

    it('should accept messages from trusted origins', async () => {
      const handler = vi.fn().mockReturnValue({ ok: true });
      messenger.on('test', handler);

      const request = createRequestMessage('req-1', 'test', { data: 'value' }, {
        uid: 'trusted-uid',
        domain: 'https://host.com',
      });

      // Dispatch from a trusted origin
      dispatchMessage(serializeMessage(request), { postMessage: vi.fn() } as unknown as Window, 'https://host.com');

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalled();
    });

    it('should use event origin instead of claimed message source domain', async () => {
      const handler = vi.fn().mockReturnValue({ ok: true });
      messenger.on('test', handler);

      const sourceWindow = { postMessage: vi.fn() } as unknown as Window;
      const request = createRequestMessage('req-1', 'test', { data: 'value' }, {
        uid: 'trusted-uid',
        domain: 'https://spoofed.example.com',
      });

      dispatchMessage(serializeMessage(request), sourceWindow, 'https://host.com');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalledWith(
        { data: 'value' },
        { uid: 'trusted-uid', domain: 'https://host.com' }
      );
    });

    it('should keep first bound uid for a source window', async () => {
      const handler = vi.fn().mockReturnValue({ ok: true });
      messenger.on('test', handler);

      const sourceWindow = { postMessage: vi.fn() } as unknown as Window;
      const first = createRequestMessage('req-1', 'test', {}, {
        uid: 'original-uid',
        domain: 'https://host.com',
      });
      const second = createRequestMessage('req-2', 'test', {}, {
        uid: 'spoofed-uid',
        domain: 'https://host.com',
      });

      dispatchMessage(serializeMessage(first), sourceWindow, 'https://host.com');
      dispatchMessage(serializeMessage(second), sourceWindow, 'https://host.com');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handler).toHaveBeenNthCalledWith(1, {}, {
        uid: 'original-uid',
        domain: 'https://host.com',
      });
      expect(handler).toHaveBeenNthCalledWith(2, {}, {
        uid: 'original-uid',
        domain: 'https://host.com',
      });
    });

    it('should allow adding trusted domains dynamically', async () => {
      const handler = vi.fn().mockReturnValue({ ok: true });
      messenger.on('test', handler);

      const request = createRequestMessage('req-1', 'test', { data: 'value' }, {
        uid: 'new-uid',
        domain: 'https://new-trusted.com',
      });

      // Initially untrusted
      dispatchMessage(serializeMessage(request), { postMessage: vi.fn() } as unknown as Window, 'https://new-trusted.com');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(handler).not.toHaveBeenCalled();

      // Add trust
      messenger.addTrustedDomain('https://new-trusted.com');

      // Now should work
      dispatchMessage(serializeMessage(request), { postMessage: vi.fn() } as unknown as Window, 'https://new-trusted.com');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(handler).toHaveBeenCalled();
    });

    it('should support RegExp patterns for trusted domains', async () => {
      // Create new messenger with RegExp pattern
      const regexMessenger = new Messenger('regex-uid', mockWindow, 'https://consumer.com', /^https:\/\/.*\.trusted\.com$/);

      const handler = vi.fn().mockReturnValue({ ok: true });
      regexMessenger.on('test', handler);

      const request = createRequestMessage('req-1', 'test', {}, {
        uid: 'subdomain-uid',
        domain: 'https://sub.trusted.com',
      });

      dispatchMessage(serializeMessage(request), { postMessage: vi.fn() } as unknown as Window, 'https://sub.trusted.com');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalled();

      regexMessenger.destroy();
    });

    it('should support wildcard string patterns for trusted domains', async () => {
      const wildcardMessenger = new Messenger('wildcard-uid', mockWindow, 'https://consumer.com', 'https://*.trusted.com');

      const handler = vi.fn().mockReturnValue({ ok: true });
      wildcardMessenger.on('test', handler);

      const request = createRequestMessage('req-1', 'test', {}, {
        uid: 'wildcard-uid',
        domain: 'https://api.trusted.com',
      });

      dispatchMessage(serializeMessage(request), { postMessage: vi.fn() } as unknown as Window, 'https://api.trusted.com');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalled();

      wildcardMessenger.destroy();
    });

    it('should support mixed string and RegExp patterns in trusted domain arrays', async () => {
      const mixedMessenger = new Messenger('mixed-uid', mockWindow, 'https://consumer.com', [
        'https://trusted.com',
        /^https:\/\/.*\.trusted-regex\.com$/,
      ]);

      const handler = vi.fn().mockReturnValue({ ok: true });
      mixedMessenger.on('test', handler);

      const request = createRequestMessage('req-1', 'test', {}, {
        uid: 'mixed-uid',
        domain: 'https://sub.trusted-regex.com',
      });

      dispatchMessage(serializeMessage(request), { postMessage: vi.fn() } as unknown as Window, 'https://sub.trusted-regex.com');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalled();

      mixedMessenger.destroy();
    });
  });

  describe('destroy', () => {
    it('should remove message listener', () => {
      messenger.destroy();

      expect(mockWindow.removeEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function)
      );
    });

    it('should reject all pending requests', async () => {
      vi.useFakeTimers();

      const targetWindow = {
        postMessage: vi.fn(),
      } as unknown as Window;

      const sendPromise = messenger.send(
        targetWindow,
        'https://target.com',
        'test'
      );

      messenger.destroy();

      await expect(sendPromise).rejects.toThrow('Messenger destroyed');

      vi.useRealTimers();
    });

    it('should be idempotent', () => {
      messenger.destroy();
      messenger.destroy();

      // Should only remove listener once
      expect(mockWindow.removeEventListener).toHaveBeenCalledTimes(1);
    });

    it('should set isDestroyed flag', () => {
      expect(messenger.isDestroyed()).toBe(false);

      messenger.destroy();

      expect(messenger.isDestroyed()).toBe(true);
    });
  });
});
