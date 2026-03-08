/**
 * Window utilities for ForgeFrame cross-window communication.
 *
 * @remarks
 * This module provides utilities for working with browser windows in cross-origin
 * contexts. It includes helpers for domain matching, window hierarchy navigation,
 * window name payload encoding/decoding, and window reference management.
 *
 * @packageDocumentation
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
} from '@/window/helpers';

export {
  buildWindowName,
  parseWindowName,
  isForgeFrameWindow,
  isHostOfComponent,
  createWindowPayload,
  updateWindowName,
  getInitialPayload,
} from '@/window/name-payload';

export {
  registerWindow,
  unregisterWindow,
  getWindowByUID,
  createWindowRef,
  resolveWindowRef,
  serializeWindowRef,
  clearWindowRegistry,
} from '@/window/proxy';
