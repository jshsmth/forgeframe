/**
 * @packageDocumentation
 * Internal source barrel for ForgeFrame window utilities.
 *
 * @remarks
 * This file groups cross-window helpers, payload parsing, and window reference
 * helpers for internal source organization. The published package does not
 * expose a `forgeframe/window` subpath, so consumers should treat this barrel
 * as internal implementation structure.
 */

export {
  getDomain,
  isSameDomain,
  matchDomain,
  isWindowClosed,
  getOpener,
  getConsumer,
  getTop,
  isIframe,
  isPopup,
  getAncestor,
  getDistanceToConsumer,
  focusWindow,
  closeWindow,
  getFrames,
} from './helpers';

export {
  buildWindowName,
  parseWindowName,
  isForgeFrameWindow,
  isHostOfComponent,
  createWindowPayload,
  updateWindowName,
  getInitialPayload,
} from './name-payload';

export {
  registerWindow,
  unregisterWindow,
  getWindowByUID,
  createWindowRef,
  resolveWindowRef,
  serializeWindowRef,
  clearWindowRegistry,
} from './proxy';
