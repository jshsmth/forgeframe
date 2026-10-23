import { vi } from "vitest";

/** Internal consumer accessor that peer discovery uses for origin scoping. */
interface VerifiedHostDomainAccess {
	getVerifiedHostDomain(): string | null;
}

/** Verified host origin shared by same-origin peer fixtures. */
export const PEER_HOST_DOMAIN = "https://peer-host.example.com";

/**
 * Marks consumer instances as connected to a host at the supplied verified origin,
 * so peer discovery can select them without rendering a host for each one.
 */
export function setVerifiedHostDomain(
	domain: string | null,
	...instances: object[]
): void {
	for (const instance of instances) {
		vi.spyOn(
			instance as VerifiedHostDomainAccess,
			"getVerifiedHostDomain",
		).mockReturnValue(domain);
	}
}

/** Reads the verified host origin that peer discovery uses for an instance. */
export function getVerifiedHostDomain(instance: object): string | null {
	return (instance as VerifiedHostDomainAccess).getVerifiedHostDomain();
}
