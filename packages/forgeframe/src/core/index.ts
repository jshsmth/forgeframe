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
	create,
	destroy,
	destroyAll,
	destroyByTag,
} from "./component";

export {
	getHostProps,
	initHost,
	isEmbedded,
	isHost,
} from "./host";
