/**
 * @packageDocumentation
 * Cross-domain messenger implementation.
 *
 * @remarks
 * Provides a simple request/response communication layer over postMessage.
 */

import { MESSAGE_TYPE } from "../constants";
import type { OriginMatcher } from "../types/utility";
import {
	compileWildcardDomainPattern,
	testDomainRegExpStateless,
} from "../utils/domain-pattern";
import { normalizeError } from "../utils/error";
import { isOpaqueOrigin } from "../utils/origin";
import { createDeferred, type Deferred } from "../utils/promise";
import { generateShortUID } from "../utils/uid";
import {
	createRequestMessage,
	createResponseMessage,
	deserializeMessage,
	serializeMessage,
} from "./protocol";
import type { Message } from "./types";

/**
 * Handler function for incoming messages.
 *
 * @remarks
 * `source.uid` identifies the shared component channel. `source.domain` and
 * `source.window` are taken from the browser's `MessageEvent` rather than the
 * message's claimed source metadata.
 *
 * @typeParam T - The expected data type of incoming messages
 * @typeParam R - The return type of the handler
 * @internal
 */
export type MessageHandler<T = unknown, R = unknown> = (
	data: T,
	source: { uid: string; domain: string; window: Window },
) => R | Promise<R>;

/**
 * Tracks a pending request awaiting response.
 * @internal
 */
interface PendingRequest {
	name: string;
	deferred: Deferred<unknown>;
	timeout: ReturnType<typeof setTimeout> | undefined;
	targetWin: Window;
	expectedOrigin: string;
}

function isPendingResponseSourceMatch(
	pending: PendingRequest,
	sourceWin: Window,
	origin: string,
): boolean {
	return sourceWin === pending.targetWin && origin === pending.expectedOrigin;
}

/**
 * Resolves a message target to the exact origin that receives it and answers.
 * URL-like targets normalize to their origin, as `postMessage` does.
 * @throws If the target is not an absolute URL, including the `"*"` wildcard
 * and the `"/"` same-origin token, or if its origin is opaque, as for
 * `data:` and `about:` URLs, which no window can be addressed by.
 */
function resolveTargetOrigin(targetDomain: string, name: string): string {
	let origin: string;
	try {
		origin = new URL(targetDomain).origin;
	} catch {
		throw new Error(
			`Cannot send "${name}": target origin "${targetDomain}" is not an absolute URL`,
		);
	}
	if (isOpaqueOrigin(origin)) {
		throw new Error(
			`Cannot send "${name}": target origin "${targetDomain}" is opaque`,
		);
	}
	return origin;
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
 * @internal
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

	/**
	 * Creates a new Messenger instance.
	 *
	 * @remarks
	 * The messenger trusts its own origin, unless that origin is opaque
	 * (`"null"`): every opaque document serializes the same way, so trusting it
	 * would admit any sandboxed frame.
	 *
	 * @param channelUid - Component channel identifier shared by the paired consumer and host messengers
	 * @param win - The window to listen for messages on
	 * @param domain - The origin domain of this messenger
	 * @param trustedDomains - Optional domains to trust for incoming messages
	 * @param listenImmediately - Whether to attach the message listener now; otherwise call {@link Messenger.listen}
	 */
	constructor(
		private channelUid: string,
		private win: Window = window,
		private domain: string = window.location.origin,
		trustedDomains?: OriginMatcher,
		listenImmediately = true,
	) {
		if (!isOpaqueOrigin(domain)) this.allowedOrigins.add(domain);

		if (trustedDomains) {
			this.addTrustedDomain(trustedDomains);
		}

		if (listenImmediately) this.listen();
	}

	/**
	 * Attaches the message listener once; later calls and calls after
	 * {@link Messenger.destroy} do nothing.
	 */
	listen(): void {
		if (this.listener || this.destroyed) return;
		this.setupListener();
	}

	/**
	 * Adds a trusted domain that can send messages to this messenger.
	 *
	 * @param domain - Domain pattern to trust (string, RegExp, or array)
	 */
	addTrustedDomain(domain: OriginMatcher): void {
		if (Array.isArray(domain)) {
			for (const d of domain) {
				this.addTrustedDomain(d);
			}
		} else if (domain instanceof RegExp) {
			this.allowedOriginPatterns.push(domain);
		} else {
			const wildcardPattern = compileWildcardDomainPattern(domain);
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
	removeTrustedDomain(domain: OriginMatcher): void {
		if (Array.isArray(domain)) {
			for (const d of domain) {
				this.removeTrustedDomain(d);
			}
		} else if (domain instanceof RegExp) {
			this.allowedOriginPatterns = this.allowedOriginPatterns.filter(
				(pattern) => pattern !== domain,
			);
		} else {
			const wildcardPattern = this.wildcardPatternRegistry.get(domain);
			if (wildcardPattern) {
				this.allowedOriginPatterns = this.allowedOriginPatterns.filter(
					(pattern) => pattern !== wildcardPattern,
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
		// Every opaque document serializes as "null", so no matcher, including
		// '*', can identify one.
		if (isOpaqueOrigin(origin)) return false;
		if (this.allowedOrigins.has(origin)) {
			return true;
		}

		for (const pattern of this.allowedOriginPatterns) {
			if (testDomainRegExpStateless(pattern, origin)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Sends a message and waits for a response.
	 *
	 * @typeParam T - The data type being sent
	 * @typeParam R - The expected response type
	 * @param targetWin - The target window to send to
	 * @param targetDomain - The target origin, as an absolute URL
	 * @param name - The message name/type
	 * @param data - Optional data payload
	 * @param timeout - Timeout in milliseconds (default: 10000); `null` waits
	 * until the response arrives or the request is rejected
	 * @param onDeliveryAttempt - Internal notification after encoding, immediately before posting
	 * @returns Promise resolving to the response data
	 * @throws Error if messenger is destroyed, the target is not an absolute
	 * URL, or timeout occurs
	 */
	async send<T = unknown, R = unknown>(
		targetWin: Window,
		targetDomain: string,
		name: string,
		data?: T,
		timeout: number | null = 10000,
		onDeliveryAttempt?: () => void,
	): Promise<R> {
		if (this.destroyed) {
			throw new Error("Messenger has been destroyed");
		}

		const targetOrigin = resolveTargetOrigin(targetDomain, name);
		const id = generateShortUID();
		const message = createRequestMessage(id, name, data, {
			uid: this.channelUid,
			domain: this.domain,
		});
		const serialized = serializeMessage(message);
		if (this.destroyed) throw new Error("Messenger destroyed");

		const deferred = createDeferred<R>();
		const timeoutId =
			timeout === null
				? undefined
				: setTimeout(() => {
						this.pending.delete(id);
						deferred.reject(
							new Error(`Message "${name}" timed out after ${timeout}ms`),
						);
					}, timeout);

		this.pending.set(id, {
			name,
			deferred: deferred as Deferred<unknown>,
			timeout: timeoutId,
			targetWin,
			expectedOrigin: targetOrigin,
		});

		try {
			onDeliveryAttempt?.();
			targetWin.postMessage(serialized, targetOrigin);
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
	 * @param targetDomain - The target origin, as an absolute URL
	 * @param name - The message name/type
	 * @param data - Optional data payload
	 * @throws Error if messenger is destroyed or the target is not an absolute URL
	 */
	post<T = unknown>(
		targetWin: Window,
		targetDomain: string,
		name: string,
		data?: T,
	): void {
		if (this.destroyed) {
			throw new Error("Messenger has been destroyed");
		}

		const targetOrigin = resolveTargetOrigin(targetDomain, name);
		const id = generateShortUID();
		const message = createRequestMessage(id, name, data, {
			uid: this.channelUid,
			domain: this.domain,
		});

		targetWin.postMessage(serializeMessage(message), targetOrigin);
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
		handler: MessageHandler<T, R>,
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
			const admitted = this.readTrustedMessage(event);
			if (admitted)
				void this.handleMessage(
					admitted.message,
					admitted.sourceWin,
					event.origin,
				);
		};
		this.win.addEventListener("message", this.listener);
	}

	/** Admission ordering prevents parsing or dispatching traffic from untrusted origins. */
	private readTrustedMessage(
		event: MessageEvent,
	): { message: Message; sourceWin: Window } | null {
		if (event.source === this.win) return null;
		if (!this.isOriginTrusted(event.origin)) return null;
		const message = deserializeMessage(event.data);
		if (!message || message.source.uid !== this.channelUid) return null;
		const sourceWin = event.source;
		if (
			!sourceWin ||
			typeof (sourceWin as { postMessage?: unknown }).postMessage !== "function"
		)
			return null;
		return { message, sourceWin: sourceWin as Window };
	}

	/** Routes an admitted message to one request/response responsibility. */
	private async handleMessage(
		message: Message,
		sourceWin: Window,
		origin: string,
	): Promise<void> {
		if (message.type === MESSAGE_TYPE.RESPONSE) {
			this.settlePendingResponse(message, sourceWin, origin);
			return;
		}
		if (message.type === MESSAGE_TYPE.REQUEST)
			await this.handleRequest(message, sourceWin, origin);
	}

	/** Settles a correlated request only after window and origin verification. */
	private settlePendingResponse(
		message: Message,
		sourceWin: Window,
		origin: string,
	): void {
		const pending = this.pending.get(message.id);
		if (!pending || !isPendingResponseSourceMatch(pending, sourceWin, origin))
			return;
		this.pending.delete(message.id);
		clearTimeout(pending.timeout);
		if (message.error)
			pending.deferred.reject(new Error(message.error.message));
		else pending.deferred.resolve(message.data);
	}

	private async handleRequest(
		message: Message,
		sourceWin: Window,
		origin: string,
	): Promise<void> {
		const handler = this.handlers.get(message.name);
		if (!handler) return;
		let responseData: unknown;
		let responseError: Error | undefined;
		try {
			responseData = await this.executeRequest(
				handler,
				message.data,
				sourceWin,
				origin,
			);
		} catch (error) {
			responseError = normalizeError(error);
		}
		const serialized = this.serializeResponse(
			message,
			responseData,
			responseError,
		);
		this.postResponse(sourceWin, origin, serialized);
	}

	/** Invokes user code with browser-verified metadata, preserving synchronous throw timing. */
	private executeRequest(
		handler: MessageHandler,
		data: unknown,
		sourceWin: Window,
		origin: string,
	): unknown {
		return handler(data, {
			uid: this.channelUid,
			domain: origin,
			window: sourceWin,
		});
	}

	/** An invalid handler result still produces the existing serializable error response. */
	private serializeResponse(
		message: Message,
		data: unknown,
		error?: Error,
	): string {
		const source = { uid: this.channelUid, domain: this.domain };
		try {
			return serializeMessage(
				createResponseMessage(message.id, data, source, error),
			);
		} catch {
			return serializeMessage(
				createResponseMessage(
					message.id,
					undefined,
					source,
					new Error(`Could not serialize response for "${message.name}"`),
				),
			);
		}
	}

	private postResponse(
		sourceWin: Window,
		origin: string,
		serialized: string,
	): void {
		try {
			sourceWin.postMessage(serialized, origin);
		} catch {
			/* Window might be closed. */
		}
	}

	/**
	 * Rejects pending requests of one message type sent to a window whose
	 * document can no longer answer them, such as after the host reconnects.
	 *
	 * @param name - The message name/type of the requests to reject
	 * @param targetWin - The window the requests were sent to
	 * @param error - The rejection reason
	 */
	rejectPending(name: string, targetWin: Window, error: Error): void {
		for (const [id, pending] of this.pending) {
			if (pending.name !== name || pending.targetWin !== targetWin) continue;
			this.pending.delete(id);
			clearTimeout(pending.timeout);
			pending.deferred.reject(error);
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
			this.win.removeEventListener("message", this.listener);
			this.listener = null;
		}

		for (const pending of this.pending.values()) {
			clearTimeout(pending.timeout);
			pending.deferred.reject(new Error("Messenger destroyed"));
		}
		this.pending.clear();
		this.handlers.clear();
	}
}
