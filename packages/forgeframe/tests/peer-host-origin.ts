import { vi } from "vitest";

/** Internal consumer accessor that peer discovery uses for origin scoping. */
interface VerifiedHostOriginAccess {
	getVerifiedHostOrigin(): string | null;
}

/** Verified host origin shared by same-origin peer fixtures. */
export const PEER_HOST_ORIGIN = "https://peer-host.example.com";

/**
 * Marks consumer instances as connected to a host at the supplied verified origin,
 * so peer discovery can select them without rendering a host for each one.
 */
export function setVerifiedHostOrigin(
	origin: string | null,
	...instances: object[]
): void {
	for (const instance of instances) {
		vi.spyOn(
			instance as VerifiedHostOriginAccess,
			"getVerifiedHostOrigin",
		).mockReturnValue(origin);
	}
}

/**
 * Marks consumer instances as opened at a host origin whose host has not been
 * verified yet, as while the host is still loading.
 */
export function setOpenedHostOrigin(
	origin: string | null,
	...instances: object[]
): void {
	for (const instance of instances) {
		vi.spyOn(
			instance as { getOpenedHostOrigin(): string | null },
			"getOpenedHostOrigin",
		).mockReturnValue(origin);
	}
}

/** Reads the verified host origin that peer discovery uses for an instance. */
export function getVerifiedHostOrigin(instance: object): string | null {
	return (instance as VerifiedHostOriginAccess).getVerifiedHostOrigin();
}
