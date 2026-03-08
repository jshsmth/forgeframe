/**
 * Returns true when ForgeFrame is running with browser window globals.
 *
 * @internal
 */
export function hasBrowserWindow(): boolean {
  return typeof window !== 'undefined' && typeof window.location !== 'undefined';
}
