import type { ContextType } from "../constants";
import { CONTEXT, PROTOCOL_VERSION, WINDOW_NAME_PREFIX } from "../constants";
import { ForgeFrameError, hasErrorCode } from "../errors";
import type { WindowNamePayload } from "./types";

/**
 * Maximum allowed size for the window.name payload in bytes.
 * Set to 32KB which is safe across all browsers while allowing reasonable payload sizes.
 * @internal
 */
const MAX_PAYLOAD_SIZE = 32 * 1024;

/**
 * Result of classifying a decoded window.name value.
 *
 * @remarks
 * - `current`: valid channel metadata for this protocol, copied without unknown fields.
 * - `unsupported`: a ForgeFrame payload from another protocol. `protocolVersion`
 *   is `undefined` when the payload has none; `version` is the package version
 *   an older consumer wrote, when present.
 * - `invalid`: anything else.
 *
 * @internal
 */
export type WindowNamePayloadClassification =
	| { kind: "current"; payload: WindowNamePayload }
	| {
			kind: "unsupported";
			tag: string;
			protocolVersion: number | undefined;
			version: string | undefined;
	  }
	| { kind: "invalid" };

const INVALID_PAYLOAD: WindowNamePayloadClassification = { kind: "invalid" };

/**
 * Builds a window name string with an encoded payload.
 *
 * @param payload - The channel metadata to encode into the window name.
 * @returns A window name string with the ForgeFrame prefix and base64-encoded payload.
 *
 * @remarks
 * The payload carries only channel metadata. Consumer props and child metadata
 * are delivered through verified messaging instead: window.name may remain
 * readable after redirects and must not carry sensitive data.
 *
 * @example
 * ```typescript
 * iframe.name = buildWindowName(
 *   createWindowPayload({
 *     uid: 'host-123',
 *     tag: 'my-component',
 *     context: 'iframe',
 *     consumerDomain: window.location.origin,
 *   }),
 * );
 * ```
 *
 * @internal
 */
export function buildWindowName(payload: WindowNamePayload): string {
	const encoded = encodePayload(payload);
	return `${WINDOW_NAME_PREFIX}${encoded}`;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function isContext(value: unknown): value is ContextType {
	return value === CONTEXT.IFRAME || value === CONTEXT.POPUP;
}

/**
 * Classifies a decoded window.name value by protocol, without reading browser state.
 *
 * @param value - The JSON value decoded from a ForgeFrame window name, or
 * `undefined` when decoding failed.
 * @returns The classification the host start-up reacts to.
 *
 * @remarks
 * A payload counts as another protocol only when its `protocolVersion` is
 * missing or a positive integer. An older payload (no protocol, 1 or 2) must
 * also carry the channel fields every older consumer wrote: a non-empty `uid`
 * and `tag`, a valid `context`, and a non-empty `consumerDomain`. A newer
 * payload needs only a non-empty `tag`, because its other fields are unknown.
 * Anything else, including a current payload with missing or malformed
 * metadata, is invalid.
 *
 * @internal
 */
export function classifyWindowNamePayload(
	value: unknown,
): WindowNamePayloadClassification {
	if (!isObjectRecord(value) || !isNonEmptyString(value.tag)) {
		return INVALID_PAYLOAD;
	}

	const { uid, tag, protocolVersion, context, consumerDomain } = value;
	const hasChannelFields =
		isNonEmptyString(uid) &&
		isContext(context) &&
		isNonEmptyString(consumerDomain);
	if (protocolVersion === PROTOCOL_VERSION) {
		return hasChannelFields
			? {
					kind: "current",
					payload: { uid, tag, protocolVersion, context, consumerDomain },
				}
			: INVALID_PAYLOAD;
	}

	if (
		protocolVersion !== undefined &&
		!(
			typeof protocolVersion === "number" &&
			Number.isInteger(protocolVersion) &&
			protocolVersion >= 1
		)
	) {
		return INVALID_PAYLOAD;
	}
	const isNewer =
		protocolVersion !== undefined && protocolVersion > PROTOCOL_VERSION;
	if (!isNewer && !hasChannelFields) {
		return INVALID_PAYLOAD;
	}

	return {
		kind: "unsupported",
		tag,
		protocolVersion,
		version: isNonEmptyString(value.version) ? value.version : undefined,
	};
}

/**
 * Checks if the specified window carries a decodable ForgeFrame payload.
 *
 * @param win - The window to check. Defaults to the current window.
 * @returns `true` if the window's name holds a ForgeFrame payload of any
 * protocol version, `false` otherwise.
 *
 * @remarks
 * Older and newer protocols count, so their pages reach `initHost()` and its
 * upgrade error. A name with the ForgeFrame prefix whose payload does not
 * decode to valid channel metadata does not count. This function safely
 * handles cross-origin errors.
 *
 * @internal
 */
export function isForgeFrameWindow(win: Window = window): boolean {
	const classification = readWindowNamePayload(win);
	return classification !== null && classification.kind !== "invalid";
}

/**
 * Encodes a payload to a base64 string for use in window.name.
 *
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
function encodePayload(payload: WindowNamePayload): string {
	try {
		const json = JSON.stringify(payload);
		const encoded = btoa(encodeURIComponent(json));

		// Base64 output is ASCII-only, so code-unit length matches byte length.
		const byteSize = encoded.length;
		if (byteSize > MAX_PAYLOAD_SIZE) {
			throw new ForgeFrameError(
				"CAPACITY",
				`Payload size (${Math.round(byteSize / 1024)}KB) exceeds maximum allowed size (${MAX_PAYLOAD_SIZE / 1024}KB).`,
			);
		}

		return encoded;
	} catch (err) {
		if (hasErrorCode(err, "CAPACITY")) throw err;
		throw new ForgeFrameError("VALIDATION", `Failed to encode payload: ${err}`);
	}
}

/**
 * Decodes a base64-encoded payload from a window name.
 *
 * @param encoded - The base64-encoded string to decode.
 * @returns The decoded JSON value, or `undefined` if decoding fails.
 *
 * @remarks
 * Reverses the encoding performed by {@link encodePayload}: base64-decodes,
 * URI-decodes, and JSON-parses the string.
 *
 * @internal
 */
function decodePayload(encoded: string): unknown {
	if (encoded.length > MAX_PAYLOAD_SIZE) {
		return undefined;
	}

	try {
		return JSON.parse(decodeURIComponent(atob(encoded))) as unknown;
	} catch {
		return undefined;
	}
}

/**
 * Creates the channel metadata payload for encoding into a window name.
 *
 * @param options - The channel metadata.
 * @param options.uid - Unique identifier of the consumer instance.
 * @param options.tag - Component tag name.
 * @param options.context - The context type (e.g., 'iframe' or 'popup').
 * @param options.consumerDomain - The origin of the consumer window.
 * @returns A WindowNamePayload object ready for encoding.
 *
 * @remarks
 * The current protocol version is included automatically.
 *
 * @example
 * ```typescript
 * const windowName = buildWindowName(
 *   createWindowPayload({
 *     uid: generateUID(),
 *     tag: 'checkout-form',
 *     context: 'iframe',
 *     consumerDomain: window.location.origin,
 *   }),
 * );
 * ```
 *
 * @internal
 */
export function createWindowPayload(options: {
	uid: string;
	tag: string;
	context: ContextType;
	consumerDomain: string;
}): WindowNamePayload {
	return {
		uid: options.uid,
		tag: options.tag,
		protocolVersion: PROTOCOL_VERSION,
		context: options.context,
		consumerDomain: options.consumerDomain,
	};
}

/**
 * Reads and classifies the ForgeFrame payload in a window's name.
 *
 * @param win - The window to read. Defaults to the current window.
 * @returns The payload classification, or `null` when the name is unreadable or
 * lacks the ForgeFrame prefix.
 *
 * @remarks
 * Reading never writes `window.name`, so the channel metadata stays in place
 * for same-page retries, reloads, and navigations. Undecodable and oversized
 * names are classified as invalid.
 *
 * @internal
 */
export function readWindowNamePayload(
	win: Window = window,
): WindowNamePayloadClassification | null {
	let name: unknown;
	try {
		name = win.name;
	} catch {
		// Unusual or inaccessible windows can throw when their name is read.
		return null;
	}

	if (typeof name !== "string" || !name.startsWith(WINDOW_NAME_PREFIX)) {
		return null;
	}

	return classifyWindowNamePayload(
		decodePayload(name.slice(WINDOW_NAME_PREFIX.length)),
	);
}
