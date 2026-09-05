/**
 * Type-level assertions for the public host runtime surface.
 *
 * Confirms source-compatible assignment to `HostComponent.hostProps`, which is
 * relied on by downstream tests and shims that patch host state directly.
 */
import type { HostComponent } from "@/core/host";
import type { HostProps } from "@/types";

declare const host: HostComponent<{ amount: number }>;
declare const replacement: HostProps<{ amount: number }>;

host.hostProps = replacement;
