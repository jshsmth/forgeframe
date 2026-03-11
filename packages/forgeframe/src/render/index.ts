/**
 * @packageDocumentation
 *
 * Internal source barrel for ForgeFrame rendering primitives.
 *
 * @remarks
 * This file groups iframe, popup, and template helpers for internal source
 * organization. The published package does not expose a `forgeframe/render`
 * subpath, so consumers should treat this barrel as internal implementation
 * structure.
 */

export {
  createIframe,
  createPrerenderIframe,
  destroyIframe,
  resizeIframe,
  showIframe,
  hideIframe,
  focusIframe,
  getIframeContentDimensions,
  type IframeOptions,
} from './iframe';

export {
  openPopup,
  closePopup,
  focusPopup,
  isPopupBlocked,
  watchPopupClose,
  resizePopup,
  PopupOpenError,
  type PopupOptions,
} from './popup';

export {
  defaultContainerTemplate,
  defaultPrerenderTemplate,
  applyDimensions,
  createStyleElement,
  fadeIn,
  fadeOut,
  swapPrerenderContent,
} from './templates';
