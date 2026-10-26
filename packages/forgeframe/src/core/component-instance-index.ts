/**
 * @packageDocumentation
 * Internal active component instance index.
 *
 * @remarks
 * This module tracks active component instances by UID and tag so peer lookups
 * can be performed without scanning the full component registry.
 */

import type { ComponentInstance, PeersOption } from "../types/runtime";

/** Internal accessors the index requires in addition to the public instance API. @internal */
export interface IndexedInstanceAccess {
	/** Browser-verified origin of the connected host window, if any. */
	getVerifiedHostDomain(): string | null;
	/** Origin the instance opened its host at, before verification. */
	getOpenedHostDomain(): string | null;
	/** The component's `peers` option: whether, and to whom, this instance is listed. */
	getPeers(): PeersOption;
}

export type IndexedComponentInstance = ComponentInstance &
	IndexedInstanceAccess;

const componentInstanceIndexByUid = new Map<
	string,
	{ tag: string; instance: IndexedComponentInstance }
>();
const componentInstanceIndexByTag = new Map<
	string,
	Map<string, IndexedComponentInstance>
>();

/**
 * Adds an instance to the internal lookup index.
 * @internal
 */
export function indexComponentInstance(
	tag: string,
	instance: IndexedComponentInstance,
): void {
	const existing = componentInstanceIndexByUid.get(instance.uid);
	if (existing) {
		removeIndexedComponentInstance(instance.uid);
	}

	let instancesByUid = componentInstanceIndexByTag.get(tag);
	if (!instancesByUid) {
		instancesByUid = new Map<string, IndexedComponentInstance>();
		componentInstanceIndexByTag.set(tag, instancesByUid);
	}

	instancesByUid.set(instance.uid, instance);
	componentInstanceIndexByUid.set(instance.uid, {
		tag,
		instance: instance,
	});
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
export function getComponentInstancesByTag(
	tag: string,
): IndexedComponentInstance[] {
	return Array.from(componentInstanceIndexByTag.get(tag)?.values() ?? []);
}

/**
 * Returns all active indexed instances across tags.
 * @internal
 */
export function getIndexedComponentInstances(): Array<{
	tag: string;
	instance: IndexedComponentInstance;
}> {
	return Array.from(componentInstanceIndexByUid.values());
}
