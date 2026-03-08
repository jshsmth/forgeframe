/**
 * @packageDocumentation
 *
 * Rendering utilities for ForgeFrame.
 *
 * This module provides functions for creating and managing iframes, popups,
 * and their associated templates. It handles the visual rendering layer
 * of ForgeFrame components.
 *
 * @remarks
 * The render module is divided into three main areas:
 * - **Iframe management** - Creating, destroying, and manipulating iframes
 * - **Popup management** - Opening, closing, and monitoring popup windows
 * - **Templates** - Default templates and styling utilities for containers
 *
 * @example
 * ```typescript
 * import { createIframe, openPopup, defaultContainerTemplate } from '@forgeframe/render';
 *
 * // Create an iframe
 * const iframe = createIframe({
 *   url: 'https://example.com',
 *   name: 'my-iframe',
 *   container: document.body,
 *   dimensions: { width: 400, height: 300 }
 * });
 *
 * // Open a popup
 * const popup = openPopup({
 *   url: 'https://example.com',
 *   name: 'my-popup',
 *   dimensions: { width: 600, height: 400 }
 * });
 * ```
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
} from '@/render/iframe';

export {
  openPopup,
  closePopup,
  focusPopup,
  isPopupBlocked,
  watchPopupClose,
  resizePopup,
  PopupOpenError,
  type PopupOptions,
} from '@/render/popup';

export {
  defaultContainerTemplate,
  defaultPrerenderTemplate,
  applyDimensions,
  createStyleElement,
  fadeIn,
  fadeOut,
  swapPrerenderContent,
} from '@/render/templates';
