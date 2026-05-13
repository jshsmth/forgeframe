import type { WindowNamePayload, SerializedProps, ConsumerExports, HostComponentRef } from '../types';
import type { ContextType } from '../constants';
import { CONTEXT, PROTOCOL_VERSION, WINDOW_NAME_PREFIX, VERSION } from '../constants';

const REQUIRED_CONSUMER_EXPORT_KEYS = [
  'init',
  'close',
  'resize',
  'show',
  'hide',
  'onError',
  'updateProps',
  'export',
] as const;

/**
 * Maximum allowed size for the window.name payload in bytes.
 * Set to 32KB which is safe across all browsers while allowing reasonable payload sizes.
 * @internal
 */
const MAX_PAYLOAD_SIZE = 32 * 1024;

/**
 * Builds a window name string with an encoded payload.
 *
 * @typeParam P - The type of the props included in the payload.
 * @param payload - The payload to encode into the window name.
 * @returns A window name string with the ForgeFrame prefix and base64-encoded payload.
 *
 * @remarks
 * This is the primary mechanism for passing initial props from a consumer window
 * to a host window (iframe or popup). The payload is JSON-serialized and base64-encoded
 * to ensure safe transport via the window.name property.
 *
 * @example
 * ```typescript
 * const payload: WindowNamePayload<MyProps> = {
 *   uid: 'host-123',
 *   tag: 'my-component',
 *   version: '1.0.0',
 *   context: 'iframe',
 *   consumerDomain: 'https://consumer.com',
 *   props: { message: 'Hello' },
 *   exports: {}
 * };
 *
 * const windowName = buildWindowName(payload);
 * // Use when creating iframe: iframe.name = windowName;
 * ```
 *
 * @public
 */
export function buildWindowName<P>(payload: WindowNamePayload<P>): string {
  const encoded = encodePayload(payload);
  return `${WINDOW_NAME_PREFIX}${encoded}`;
}

/**
 * Parses a window name to extract the encoded payload.
 *
 * @typeParam P - The expected type of the props in the payload.
 * @param name - The window name string to parse.
 * @returns The decoded WindowNamePayload, or `null` if the name is not a valid ForgeFrame window name.
 *
 * @remarks
 * This function checks if the window name starts with the ForgeFrame prefix,
 * then decodes the base64-encoded payload. Returns `null` if the name doesn't
 * have the expected format or if decoding fails.
 *
 * @example
 * ```typescript
 * // In a host window
 * const payload = parseWindowName<MyProps>(window.name);
 * if (payload) {
 *   console.log('Received props:', payload.props);
 *   console.log('Consumer domain:', payload.consumerDomain);
 * }
 * ```
 *
 * @public
 */
export function parseWindowName<P>(
  name: string
): WindowNamePayload<P> | null {
  if (!name || !name.startsWith(WINDOW_NAME_PREFIX)) {
    return null;
  }

  const encoded = name.slice(WINDOW_NAME_PREFIX.length);
  return decodePayload<P>(encoded);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidSerializedProps(value: unknown): value is SerializedProps {
  return isObjectRecord(value);
}

function isValidConsumerExports(value: unknown): value is ConsumerExports {
  return (
    isObjectRecord(value) &&
    REQUIRED_CONSUMER_EXPORT_KEYS.every(
      (key) => typeof value[key] === 'string' && value[key].length > 0
    )
  );
}

function isValidHostComponentRef(value: unknown): value is HostComponentRef {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (typeof value.tag !== 'string' || value.tag.length === 0) {
    return false;
  }

  if (typeof value.url !== 'string' || value.url.length === 0) {
    return false;
  }

  if (value.props !== undefined && !isObjectRecord(value.props)) {
    return false;
  }

  if (value.defaultContext !== undefined && value.defaultContext !== CONTEXT.IFRAME && value.defaultContext !== CONTEXT.POPUP) {
    return false;
  }

  if (value.dimensions !== undefined) {
    if (!isObjectRecord(value.dimensions)) {
      return false;
    }

    const { width, height } = value.dimensions as { width?: unknown; height?: unknown };
    if (
      (width !== undefined && typeof width !== 'string' && typeof width !== 'number') ||
      (height !== undefined && typeof height !== 'string' && typeof height !== 'number')
    ) {
      return false;
    }
  }

  return true;
}

function isValidChildrenMap(
  value: unknown
): value is Record<string, HostComponentRef> {
  if (!isObjectRecord(value)) {
    return false;
  }

  return Object.values(value).every((child) => isValidHostComponentRef(child));
}

function isValidWindowNamePayload<P>(
  value: unknown
): value is WindowNamePayload<P> {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (typeof value.uid !== 'string' || value.uid.length === 0) {
    return false;
  }

  if (typeof value.tag !== 'string' || value.tag.length === 0) {
    return false;
  }

  if (typeof value.version !== 'string' || value.version.length === 0) {
    return false;
  }

  if (
    value.protocolVersion !== undefined &&
    value.protocolVersion !== PROTOCOL_VERSION
  ) {
    return false;
  }

  if (value.context !== CONTEXT.IFRAME && value.context !== CONTEXT.POPUP) {
    return false;
  }

  if (typeof value.consumerDomain !== 'string' || value.consumerDomain.length === 0) {
    return false;
  }

  if (!isValidSerializedProps(value.props) || !isValidConsumerExports(value.exports)) {
    return false;
  }

  if (value.children !== undefined && !isValidChildrenMap(value.children)) {
    return false;
  }

  return true;
}

/**
 * Checks if the specified window is a ForgeFrame host window.
 *
 * @param win - The window to check. Defaults to the current window.
 * @returns `true` if the window's name starts with the ForgeFrame prefix, `false` otherwise.
 *
 * @remarks
 * A ForgeFrame host window is identified by having a window name that starts
 * with the ForgeFrame prefix. This function safely handles cross-origin errors.
 *
 * @example
 * ```typescript
 * if (isForgeFrameWindow()) {
 *   // This window was created by ForgeFrame
 *   const payload = getInitialPayload();
 * }
 * ```
 *
 * @public
 */
export function isForgeFrameWindow(win: Window = window): boolean {
  try {
    return win.name.startsWith(WINDOW_NAME_PREFIX);
  } catch {
    return false;
  }
}

/**
 * Checks if the current window is a host of a specific component tag.
 *
 * @param tag - The component tag to check for.
 * @param win - The window to check. Defaults to the current window.
 * @returns `true` if the window's payload has the specified tag, `false` otherwise.
 *
 * @remarks
 * This function parses the window name and checks if the tag in the payload
 * matches the specified tag. Useful for component-specific initialization logic.
 *
 * @example
 * ```typescript
 * if (isHostOfComponent('payment-form')) {
 *   // Initialize payment-specific features
 * }
 * ```
 *
 * @public
 */
export function isHostOfComponent(
  tag: string,
  win: Window = window
): boolean {
  const payload = parseWindowName(win.name);
  return payload?.tag === tag;
}

/**
 * Encodes a payload to a base64 string for use in window.name.
 *
 * @typeParam P - The type of the props in the payload.
 * @param payload - The payload to encode.
 * @returns A base64-encoded string representing the payload.
 * @throws Error if JSON serialization or encoding fails, or if payload exceeds size limit.
 *
 * @remarks
 * The payload is first JSON-serialized, then URI-encoded (to handle Unicode),
 * and finally base64-encoded. This ensures the result is safe for window.name.
 *
 * The function validates that the encoded payload doesn't exceed the maximum
 * allowed size (32KB) to prevent browser issues with large window.name values.
 *
 * @internal
 */
function encodePayload<P>(payload: WindowNamePayload<P>): string {
  try {
    const json = JSON.stringify(payload);
    const encoded = btoa(encodeURIComponent(json));

    // Base64 output is ASCII-only, so code-unit length matches byte length.
    const byteSize = encoded.length;
    if (byteSize > MAX_PAYLOAD_SIZE) {
      throw new Error(
        `Payload size (${Math.round(byteSize / 1024)}KB) exceeds maximum allowed size (${MAX_PAYLOAD_SIZE / 1024}KB). ` +
        `Consider reducing the amount of data passed via props.`
      );
    }

    return encoded;
  } catch (err) {
    if (err instanceof Error && err.message.includes('Payload size')) {
      throw err;
    }
    throw new Error(`Failed to encode payload: ${err}`);
  }
}

/**
 * Decodes a base64-encoded payload from a window name.
 *
 * @typeParam P - The expected type of the props in the payload.
 * @param encoded - The base64-encoded string to decode.
 * @returns The decoded WindowNamePayload, or `null` if decoding fails.
 *
 * @remarks
 * Reverses the encoding performed by {@link encodePayload}: base64-decodes,
 * URI-decodes, and JSON-parses the string. Returns `null` on any error.
 *
 * @internal
 */
function decodePayload<P>(encoded: string): WindowNamePayload<P> | null {
  try {
    const json = decodeURIComponent(atob(encoded));
    const parsed = JSON.parse(json) as unknown;
    return isValidWindowNamePayload<P>(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Creates a window payload object for encoding into a window name.
 *
 * @typeParam P - The type of the props (used for type inference in the returned payload).
 * @param options - The options for creating the payload.
 * @param options.uid - Unique identifier for the host window.
 * @param options.tag - Component tag name.
 * @param options.context - The context type (e.g., 'iframe' or 'popup').
 * @param options.consumerDomain - The origin of the consumer window.
 * @param options.props - Serialized props to pass to the host.
 * @param options.exports - Functions exported by the consumer for the host to call.
 * @param options.children - Optional map of nested component references.
 * @returns A WindowNamePayload object ready for encoding.
 *
 * @remarks
 * This is a factory function that creates a properly structured payload with
 * the current ForgeFrame version automatically included.
 *
 * @example
 * ```typescript
 * const payload = createWindowPayload<MyProps>({
 *   uid: generateUID(),
 *   tag: 'checkout-form',
 *   context: 'iframe',
 *   consumerDomain: window.location.origin,
 *   props: { amount: 100 },
 *   exports: { onSuccess: true, onError: true }
 * });
 *
 * const windowName = buildWindowName(payload);
 * ```
 *
 * @public
 */
export function createWindowPayload<P>(options: {
  uid: string;
  tag: string;
  context: ContextType;
  consumerDomain: string;
  props: SerializedProps;
  exports: ConsumerExports;
  children?: Record<string, HostComponentRef>;
}): WindowNamePayload<P> {
  return {
    uid: options.uid,
    tag: options.tag,
    version: VERSION,
    protocolVersion: PROTOCOL_VERSION,
    context: options.context,
    consumerDomain: options.consumerDomain,
    props: options.props,
    exports: options.exports,
    children: options.children,
  };
}

/**
 * Updates a window's name with a new encoded payload.
 *
 * @typeParam P - The type of the props in the payload.
 * @param win - The window whose name should be updated.
 * @param payload - The new payload to encode into the window name.
 *
 * @remarks
 * This function is used when the consumer needs to update the host's reference
 * or pass updated data. It safely handles cross-origin errors by silently failing.
 *
 * @example
 * ```typescript
 * // Update host window with new props
 * const updatedPayload = { ...existingPayload, props: { newValue: 42 } };
 * updateWindowName(hostWindow, updatedPayload);
 * ```
 *
 * @public
 */
export function updateWindowName<P>(
  win: Window,
  payload: WindowNamePayload<P>
): void {
  try {
    win.name = buildWindowName(payload);
  } catch {
    // Cross-origin errors are silently ignored
  }
}

/**
 * Gets the initial payload from a window's name.
 *
 * @typeParam P - The expected type of the props in the payload.
 * @param win - The window to read the payload from. Defaults to the current window.
 * @returns The decoded WindowNamePayload, or `null` if not a ForgeFrame window.
 *
 * @remarks
 * This is a convenience function typically used by host components during
 * initialization to read the data passed by the consumer window.
 *
 * @example
 * ```typescript
 * // In host window initialization
 * const payload = getInitialPayload<MyProps>();
 * if (payload) {
 *   initializeComponent(payload.props);
 *   setupConsumerCommunication(payload.consumerDomain);
 * }
 * ```
 *
 * @public
 */
export function getInitialPayload<P>(
  win: Window = window
): WindowNamePayload<P> | null {
  return parseWindowName(win.name);
}

/**
 * Reads and clears the initial ForgeFrame bootstrap payload from a window name.
 *
 * @typeParam P - The expected type of the props in the payload.
 * @param win - The window to consume the payload from. Defaults to the current window.
 * @returns The decoded WindowNamePayload, or `null` if not a valid ForgeFrame window.
 *
 * @remarks
 * `window.name` persists across navigations, so host bootstrap should consume the
 * payload once and clear it after a successful parse.
 *
 * @internal
 */
export function consumeInitialPayload<P>(
  win: Window = window
): WindowNamePayload<P> | null {
  let name: string;
  try {
    name = win.name;
  } catch {
    return null;
  }

  const payload = parseWindowName<P>(name);
  if (!payload) {
    return null;
  }

  clearInitialPayload(win, name);

  return payload;
}

/**
 * Clears the current ForgeFrame bootstrap payload from a window name.
 *
 * @param win - The window to clear. Defaults to the current window.
 * @param expectedName - Optional exact window.name value that must still be present.
 *
 * @remarks
 * The `expectedName` guard prevents clearing a newer or externally replaced
 * `window.name` value after a delayed bootstrap path.
 *
 * @internal
 */
export function clearInitialPayload(
  win: Window = window,
  expectedName?: string
): void {
  try {
    if (expectedName !== undefined) {
      if (win.name !== expectedName) {
        return;
      }
    } else if (!getInitialPayload(win)) {
      return;
    }

    win.name = '';
  } catch {
    // Clearing can fail for unusual window objects; host initialization can still succeed.
  }
}
