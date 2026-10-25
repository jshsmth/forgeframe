/**
 * The consumer page the playground hosts expect to embed them.
 *
 * @remarks
 * `VITE_CONSUMER_URL` overrides it. The local default follows this page's
 * protocol, so HTTP and HTTPS dev servers both work.
 */
export const consumerUrl =
	import.meta.env.VITE_CONSUMER_URL || `${location.protocol}//localhost:5173`;
