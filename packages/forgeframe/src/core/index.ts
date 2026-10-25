/**
 * @packageDocumentation
 * Core module for ForgeFrame component creation and lifecycle management.
 *
 * @remarks
 * This module provides the primary API for creating, managing, and destroying
 * cross-domain components. It includes both consumer-side (embedding app) and
 * host-side (embedded page) functionality.
 */

export { closeAll, create } from "./component";

export { initHost, isHost } from "./host";
