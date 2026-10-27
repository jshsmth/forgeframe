/**
 * Internal communication wire contracts.
 */

/**
 * Serialized function reference for cross-domain calls.
 *
 * @internal
 */
export interface FunctionRef {
	/** Type marker */
	__type__: "function";
	/** Unique function ID */
	__id__: string;
	/** Function name for debugging */
	__name__: string;
}

/**
 * Cross-domain message structure.
 *
 * @internal
 */
export interface Message {
	/** Unique message ID */
	id: string;
	/** Message type */
	type: "request" | "response";
	/** Message name/action */
	name: string;
	/** Message payload */
	data?: unknown;
	/** Error information (for error responses) */
	error?:
		| {
				message: string;
				/**
				 * The `ForgeFrameErrorCode` of an error ForgeFrame raised. Absent for
				 * errors thrown by application code, such as a remote callback.
				 */
				code?: string | undefined;
		  }
		| undefined;
	/**
	 * Message source metadata.
	 *
	 * @remarks
	 * `uid` is the logical component channel shared by the consumer and host.
	 * `domain` is the sender's declared origin; receivers use `MessageEvent.origin`
	 * for trust decisions.
	 */
	source: {
		uid: string;
		domain: string;
	};
}
