/**
 * Origin helpers shared by trust and peer-scoping checks.
 *
 * @remarks
 * Origins are serialized strings. The JavaScript value `null` means no origin
 * is known yet, such as before a host connects. The string `"null"` is the
 * serialization of an opaque origin, such as a sandboxed document without
 * `allow-same-origin`. Every opaque origin is distinct from all others, so
 * `"null"` can never identify or authorize a particular peer.
 */

/** Serialized form shared by every opaque origin. */
const OPAQUE_ORIGIN = "null";

/** Whether a serialized origin is opaque and therefore cannot identify a peer. @internal */
export function isOpaqueOrigin(origin: string | null): boolean {
	return origin === OPAQUE_ORIGIN;
}
