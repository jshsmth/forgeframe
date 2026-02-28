/**
 * @packageDocumentation
 * Cross-domain messenger implementation.
 *
 * @remarks
 * Provides a simple request/response communication layer over postMessage,
 * replacing post-robot with a minimal implementation.
 */

import type { Message, DomainMatcher } from '../types';
import { MESSAGE_TYPE } from '../constants';
import { generateShortUID } from '../utils/uid';
import { createDeferred, type Deferred } from '../utils/promise';
import {
  serializeMessage,
  deserializeMessage,
  createRequestMessage,
  createResponseMessage,
} from './protocol';

/**
 * Handler function for incoming messages.
 *
 * @typeParam T - The expected data type of incoming messages
 * @typeParam R - The return type of the handler
 * @public
 */
export type MessageHandler<T = unknown, R = unknown> = (
  data: T,
  source: { uid: string; domain: string }
) => R | Promise<R>;

/**
 * Tracks a pending request awaiting response.
 * @internal
 */
interface PendingRequest {
  deferred: Deferred<unknown>;
  timeout: ReturnType<typeof setTimeout>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardToRegExp(pattern: string): RegExp | null {
  if (!pattern.includes('*')) {
    return null;
  }

  const escaped = pattern
    .split('*')
    .map((segment) => escapeRegExp(segment))
    .join('.*');

  return new RegExp(`^${escaped}$`);
}

function testPattern(pattern: RegExp, origin: string): boolean {
  if (pattern.global || pattern.sticky) {
    const stateless = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
    return stateless.test(origin);
  }

  return pattern.test(origin);
}

interface VerifiedSource {
  uid: string;
  domain: string;
}

/**
 * Cross-domain messenger using postMessage.
 *
 * @remarks
 * This class provides a request/response communication layer over the
 * browser's postMessage API. It handles message serialization, timeouts,
 * and response correlation.
 *
 * @example
 * ```typescript
 * const messenger = new Messenger('component-123', window, window.location.origin);
 *
 * // Register handler
 * messenger.on('greeting', (data) => {
 *   return { message: `Hello, ${data.name}!` };
 * });
 *
 * // Send message
 * const response = await messenger.send(targetWindow, targetOrigin, 'greeting', { name: 'World' });
 * ```
 *
 * @public
 */
export class Messenger {
  /** @internal */
  private pending = new Map<string, PendingRequest>();

  /** @internal */
  private handlers = new Map<string, MessageHandler>();

  /** @internal */
  private listener: ((event: MessageEvent) => void) | null = null;

  /** @internal */
  private destroyed = false;

  /** @internal */
  private allowedOrigins: Set<string> = new Set();

  /** @internal */
  private allowedOriginPatterns: RegExp[] = [];

  /** @internal */
  private wildcardPatternRegistry = new Map<string, RegExp>();

  /** @internal */
  private sourceUidRegistry = new WeakMap<object, string>();

  /**
   * Creates a new Messenger instance.
   *
   * @param uid - Unique identifier for this messenger
   * @param win - The window to listen for messages on
   * @param domain - The origin domain of this messenger
   * @param trustedDomains - Optional domains to trust for incoming messages
   */
  constructor(
    private uid: string,
    private win: Window = window,
    private domain: string = window.location.origin,
    trustedDomains?: DomainMatcher
  ) {
    this.allowedOrigins.add(domain);

    if (trustedDomains) {
      this.addTrustedDomain(trustedDomains);
    }

    this.setupListener();
  }

  /**
   * Adds a trusted domain that can send messages to this messenger.
   *
   * @param domain - Domain pattern to trust (string, RegExp, or array)
   */
  addTrustedDomain(domain: DomainMatcher): void {
    if (Array.isArray(domain)) {
      for (const d of domain) {
        this.addTrustedDomain(d);
      }
    } else if (domain instanceof RegExp) {
      this.allowedOriginPatterns.push(domain);
    } else {
      const wildcardPattern = wildcardToRegExp(domain);
      if (wildcardPattern) {
        if (!this.wildcardPatternRegistry.has(domain)) {
          this.wildcardPatternRegistry.set(domain, wildcardPattern);
          this.allowedOriginPatterns.push(wildcardPattern);
        }
      } else {
        this.allowedOrigins.add(domain);
      }
    }
  }

  /**
   * Removes a trusted domain from this messenger.
   *
   * @param domain - Domain pattern to remove (string, RegExp, or array)
   */
  removeTrustedDomain(domain: DomainMatcher): void {
    if (Array.isArray(domain)) {
      for (const d of domain) {
        this.removeTrustedDomain(d);
      }
    } else if (domain instanceof RegExp) {
      this.allowedOriginPatterns = this.allowedOriginPatterns.filter((pattern) => pattern !== domain);
    } else {
      const wildcardPattern = this.wildcardPatternRegistry.get(domain);
      if (wildcardPattern) {
        this.allowedOriginPatterns = this.allowedOriginPatterns.filter(
          (pattern) => pattern !== wildcardPattern
        );
        this.wildcardPatternRegistry.delete(domain);
      }
      this.allowedOrigins.delete(domain);
    }
  }

  /**
   * Checks if an origin is trusted.
   *
   * @param origin - The origin to check
   * @returns True if the origin is trusted
   * @internal
   */
  private isOriginTrusted(origin: string): boolean {
    if (this.allowedOrigins.has(origin)) {
      return true;
    }

    for (const pattern of this.allowedOriginPatterns) {
      if (testPattern(pattern, origin)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Resolves source identity from the browser event context.
   * @internal
   */
  private resolveVerifiedSource(
    sourceWin: Window,
    origin: string,
    claimedSource: Message['source']
  ): VerifiedSource {
    const sourceObject = sourceWin as unknown as object;
    const existingUid = this.sourceUidRegistry.get(sourceObject);

    if (existingUid) {
      return { uid: existingUid, domain: origin };
    }

    const claimedUid =
      claimedSource && typeof claimedSource.uid === 'string' && claimedSource.uid.length > 0
        ? claimedSource.uid
        : generateShortUID();

    this.sourceUidRegistry.set(sourceObject, claimedUid);
    return { uid: claimedUid, domain: origin };
  }

  /**
   * Sends a message and waits for a response.
   *
   * @typeParam T - The data type being sent
   * @typeParam R - The expected response type
   * @param targetWin - The target window to send to
   * @param targetDomain - The target origin domain
   * @param name - The message name/type
   * @param data - Optional data payload
   * @param timeout - Timeout in milliseconds (default: 10000)
   * @returns Promise resolving to the response data
   * @throws Error if messenger is destroyed or timeout occurs
   */
  async send<T = unknown, R = unknown>(
    targetWin: Window,
    targetDomain: string,
    name: string,
    data?: T,
    timeout = 10000
  ): Promise<R> {
    if (this.destroyed) {
      throw new Error('Messenger has been destroyed');
    }

    const id = generateShortUID();
    const message = createRequestMessage(id, name, data, {
      uid: this.uid,
      domain: this.domain,
    });

    const deferred = createDeferred<R>();
    const timeoutId = setTimeout(() => {
      this.pending.delete(id);
      deferred.reject(new Error(`Message "${name}" timed out after ${timeout}ms`));
    }, timeout);

    this.pending.set(id, {
      deferred: deferred as Deferred<unknown>,
      timeout: timeoutId,
    });

    try {
      targetWin.postMessage(serializeMessage(message), targetDomain);
    } catch (err) {
      this.pending.delete(id);
      clearTimeout(timeoutId);
      throw err;
    }

    return deferred.promise;
  }

  /**
   * Sends a one-way message without waiting for a response.
   *
   * @typeParam T - The data type being sent
   * @param targetWin - The target window to send to
   * @param targetDomain - The target origin domain
   * @param name - The message name/type
   * @param data - Optional data payload
   * @throws Error if messenger is destroyed
   */
  post<T = unknown>(
    targetWin: Window,
    targetDomain: string,
    name: string,
    data?: T
  ): void {
    if (this.destroyed) {
      throw new Error('Messenger has been destroyed');
    }

    const id = generateShortUID();
    const message = createRequestMessage(id, name, data, {
      uid: this.uid,
      domain: this.domain,
    });

    targetWin.postMessage(serializeMessage(message), targetDomain);
  }

  /**
   * Registers a handler for incoming messages of a specific type.
   *
   * @typeParam T - The expected data type of incoming messages
   * @typeParam R - The return type of the handler
   * @param name - The message name/type to handle
   * @param handler - The handler function
   * @returns Function to unregister the handler
   */
  on<T = unknown, R = unknown>(
    name: string,
    handler: MessageHandler<T, R>
  ): () => void {
    this.handlers.set(name, handler as MessageHandler);
    return () => this.handlers.delete(name);
  }

  /**
   * Sets up the postMessage event listener.
   * @internal
   */
  private setupListener(): void {
    this.listener = (event: MessageEvent) => {
      if (event.source === this.win) return;

      // Security: Validate origin before processing any message
      if (!this.isOriginTrusted(event.origin)) {
        // Silently ignore messages from untrusted origins
        return;
      }

      const message = deserializeMessage(event.data);
      if (!message) return;

      const sourceWin = event.source;
      if (!sourceWin || typeof (sourceWin as { postMessage?: unknown }).postMessage !== 'function') {
        return;
      }

      this.handleMessage(message, sourceWin as Window, event.origin);
    };

    this.win.addEventListener('message', this.listener);
  }

  /**
   * Processes a received message.
   * @internal
   */
  private async handleMessage(
    message: Message,
    sourceWin: Window,
    origin: string
  ): Promise<void> {
    if (message.type === MESSAGE_TYPE.RESPONSE) {
      const pending = this.pending.get(message.id);
      if (pending) {
        this.pending.delete(message.id);
        clearTimeout(pending.timeout);

        if (message.error) {
          const error = new Error(message.error.message);
          error.stack = message.error.stack;
          pending.deferred.reject(error);
        } else {
          pending.deferred.resolve(message.data);
        }
      }
      return;
    }

    if (message.type === MESSAGE_TYPE.REQUEST) {
      const handler = this.handlers.get(message.name);
      if (!handler) {
        return;
      }

      let responseData: unknown;
      let responseError: Error | undefined;

      try {
        const verifiedSource = this.resolveVerifiedSource(
          sourceWin,
          origin,
          message.source
        );
        responseData = await handler(message.data, verifiedSource);
      } catch (err) {
        responseError = err instanceof Error ? err : new Error(String(err));
      }

      const response = createResponseMessage(
        message.id,
        responseData,
        { uid: this.uid, domain: this.domain },
        responseError
      );

      try {
        sourceWin.postMessage(serializeMessage(response), origin);
      } catch {
        // Window might be closed
      }
    }
  }

  /**
   * Cleans up the messenger and releases resources.
   *
   * @remarks
   * Removes the message listener, rejects all pending requests,
   * and clears all handlers.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.listener) {
      this.win.removeEventListener('message', this.listener);
      this.listener = null;
    }

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.deferred.reject(new Error('Messenger destroyed'));
    }
    this.pending.clear();
    this.handlers.clear();
  }

  /**
   * Checks if the messenger has been destroyed.
   *
   * @returns True if destroy() has been called
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }
}
