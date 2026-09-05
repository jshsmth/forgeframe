/**
 * @packageDocumentation
 * Core module for ForgeFrame component creation and lifecycle management.
 *
 * @remarks
 * This module provides the primary API for creating, managing, and destroying
 * cross-domain components. It includes both consumer-side (embedding app) and
 * host-side (embedded page) functionality.
 */

export {
	clearComponents,
	create,
	destroy,
	destroyAll,
	destroyByTag,
	getComponent,
	unregisterComponent,
} from "./component";

export { ConsumerComponent } from "./consumer";
export {
	getHost,
	getHostProps,
	HostComponent,
	initHost,
	isEmbedded,
	isHost,
} from "./host";
