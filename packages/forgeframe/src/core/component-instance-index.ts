/**
 * @packageDocumentation
 * Internal active component instance index.
 *
 * @remarks
 * This module tracks active component instances by UID and tag so peer lookups
 * can be performed without scanning the full component registry.
 */

import type { ForgeFrameComponentInstance } from '../types/runtime';

export type IndexedComponentInstance = ForgeFrameComponentInstance<Record<string, unknown>, unknown>;

const componentInstanceIndexByUid = new Map<string, { tag: string; instance: IndexedComponentInstance }>();
const componentInstanceIndexByTag = new Map<string, Map<string, IndexedComponentInstance>>();

/**
 * Adds an instance to the internal lookup index.
 * @internal
 */
export function indexComponentInstance<
  P extends Record<string, unknown>,
  X,
  I,
  SchemaInputs,
>(
  tag: string,
  instance: ForgeFrameComponentInstance<P, X, I, SchemaInputs>
): void {
  const indexedInstance = instance as IndexedComponentInstance;
  const existing = componentInstanceIndexByUid.get(indexedInstance.uid);
  if (existing) {
    removeIndexedComponentInstance(indexedInstance.uid);
  }

  let instancesByUid = componentInstanceIndexByTag.get(tag);
  if (!instancesByUid) {
    instancesByUid = new Map<string, IndexedComponentInstance>();
    componentInstanceIndexByTag.set(tag, instancesByUid);
  }

  instancesByUid.set(indexedInstance.uid, indexedInstance);
  componentInstanceIndexByUid.set(indexedInstance.uid, { tag, instance: indexedInstance });
}

/**
 * Removes an instance from the internal lookup index.
 * @internal
 */
export function removeIndexedComponentInstance(uid: string): void {
  const indexed = componentInstanceIndexByUid.get(uid);
  if (!indexed) {
    return;
  }

  componentInstanceIndexByUid.delete(uid);
  const taggedInstances = componentInstanceIndexByTag.get(indexed.tag);
  if (!taggedInstances) {
    return;
  }

  taggedInstances.delete(uid);
  if (taggedInstances.size === 0) {
    componentInstanceIndexByTag.delete(indexed.tag);
  }
}

/**
 * Removes all indexed instances for a specific component tag.
 * @internal
 */
export function clearIndexedInstancesByTag(tag: string): void {
  const taggedInstances = componentInstanceIndexByTag.get(tag);
  if (!taggedInstances) {
    return;
  }

  for (const uid of taggedInstances.keys()) {
    componentInstanceIndexByUid.delete(uid);
  }
  componentInstanceIndexByTag.delete(tag);
}

/**
 * Clears all active indexed instances.
 * @internal
 */
export function clearIndexedInstances(): void {
  componentInstanceIndexByUid.clear();
  componentInstanceIndexByTag.clear();
}

/**
 * Returns active instances for a specific component tag.
 * @internal
 */
export function getComponentInstancesByTag(tag: string): IndexedComponentInstance[] {
  return Array.from(componentInstanceIndexByTag.get(tag)?.values() ?? []);
}

/**
 * Returns all active indexed instances across tags.
 * @internal
 */
export function getIndexedComponentInstances(): Array<{ tag: string; instance: IndexedComponentInstance }> {
  return Array.from(componentInstanceIndexByUid.values());
}
