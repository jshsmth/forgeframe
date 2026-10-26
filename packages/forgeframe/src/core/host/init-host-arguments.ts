/**
 * @packageDocumentation
 * `initHost()` call-shape policy.
 *
 * @remarks
 * This internal module checks `initHost()` arguments without reading the
 * browser environment, so a v1 call shape fails closed everywhere. It resolves
 * the component form's tag and definitions from the registry, and every error
 * names the v2 call shape.
 */

import { assertPropDefinitions } from "../../props/definition-checks";
import type { HostPropsDefinition } from "../../types/props";
import type { ForgeFrameComponent } from "../../types/runtime";
import type { DomainMatcher } from "../../types/utility";
import { assertDomainMatcher } from "../../utils/domain-pattern";
import { getComponentOptions } from "../component-registry";
import { assertNoReservedPropDefinitions } from "./builtin-keys";

/** The v2 call shapes that argument errors name. */
const INIT_HOST_CALL_SHAPE =
	"initHost(Component, { consumerOrigins }) or initHost({ props, consumerOrigins })";

/** What a valid `initHost()` call starts the host with. */
export interface HostStartOptions {
	/** The tag the component form requires; absent for the tag-agnostic form. */
	componentTag?: string;
	props?: HostPropsDefinition<Record<string, unknown>>;
	consumerOrigins: DomainMatcher;
	autoInit: boolean;
}

/** Builds an argument error that ends with the v2 call shapes. */
function callShapeError(message: string): TypeError {
	return new TypeError(`${message} Use ${INIT_HOST_CALL_SHAPE}.`);
}

/**
 * Checks the call shape and resolves what the host starts with.
 *
 * @throws TypeError for a bare call, a non-ForgeFrame component, v1
 * positional arguments, an unknown option, or an invalid option value
 */
export function readInitHostArguments(
	args: readonly unknown[],
): HostStartOptions {
	const [first, second] = args;
	if (typeof first === "function") {
		const componentOptions = getComponentOptions(first as ForgeFrameComponent);
		if (!componentOptions) {
			throw callShapeError(
				"initHost() expects a component returned by create() as its first argument.",
			);
		}
		if (args.length > 2) {
			throw callShapeError(
				"initHost() takes a component and one options object.",
			);
		}
		const options = readInitHostOptions(second, false);
		return {
			...options,
			componentTag: componentOptions.tag,
			props: componentOptions.props as
				| HostPropsDefinition<Record<string, unknown>>
				| undefined,
		};
	}
	if (args.length > 1) {
		throw callShapeError(
			"initHost() no longer takes a positional allowlist; pass consumerOrigins in the options object.",
		);
	}
	return readInitHostOptions(first, true);
}

/** Checks the options object's own keys and values. */
function readInitHostOptions(
	value: unknown,
	acceptsProps: boolean,
): HostStartOptions {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw callShapeError(
			"initHost() requires an options object with consumerOrigins.",
		);
	}
	for (const key of Object.keys(value)) {
		if (key === "props" && !acceptsProps) {
			throw callShapeError(
				"initHost(Component, options) does not take props; the component supplies its own prop definitions.",
			);
		}
		if (key !== "consumerOrigins" && key !== "autoInit" && key !== "props") {
			throw callShapeError(`initHost() does not accept the "${key}" option.`);
		}
	}
	const { consumerOrigins, autoInit, props } = value as Record<string, unknown>;
	if (consumerOrigins === undefined) {
		throw callShapeError(
			"initHost() requires consumerOrigins, the consumer origins allowed to embed this host; pass '*' to allow any origin.",
		);
	}
	try {
		assertDomainMatcher(consumerOrigins, "initHost() consumerOrigins");
	} catch (error) {
		throw callShapeError(`${(error as Error).message}.`);
	}
	if (autoInit !== undefined && typeof autoInit !== "boolean") {
		throw callShapeError("initHost() autoInit must be a boolean.");
	}
	if (props !== undefined) {
		if (typeof props !== "object" || props === null || Array.isArray(props)) {
			throw callShapeError(
				"initHost() props must be a prop definitions object.",
			);
		}
		assertNoReservedPropDefinitions(props);
		assertPropDefinitions(props);
	}
	return {
		consumerOrigins: consumerOrigins as DomainMatcher,
		autoInit: autoInit ?? true,
		props: props as HostPropsDefinition<Record<string, unknown>> | undefined,
	};
}
