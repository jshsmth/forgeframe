/**
 * Internal communication wire contracts.
 */

/**
 * Map of consumer methods to their message names.
 *
 * @internal
 */
export interface ConsumerExports {
  /** Init message name */
  init: string;
  /** Close message name */
  close: string;
  /** Resize message name */
  resize: string;
  /** Show message name */
  show: string;
  /** Hide message name */
  hide: string;
  /** Error message name */
  onError: string;
  /** Update props message name */
  updateProps: string;
  /** Export message name */
  export: string;
}

/**
 * Serialized function reference for cross-domain calls.
 *
 * @internal
 */
export interface FunctionRef {
  /** Type marker */
  __type__: 'function';
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
  type: 'request' | 'response' | 'ack';
  /** Message name/action */
  name: string;
  /** Message payload */
  data?: unknown;
  /** Error information (for error responses) */
  error?: {
    message: string;
    stack?: string;
  };
  /** Message source info */
  source: {
    uid: string;
    domain: string;
  };
}
