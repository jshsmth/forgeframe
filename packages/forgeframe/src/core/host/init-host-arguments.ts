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

import { ForgeFrameError } from "../../errors";
import { EMPTY_PROP_DEFINITIONS } from "../../props/definitions";
import type { StandardSchemaV1 } from "../../props/schema";
import type { PropsDefinition } from "../../types/props";
import type { OriginMatcher } from "../../types/utility";
import { assertOriginMatcher } from "../../utils/origin-pattern";
import { getComponentOptions } from "../component-registry";
import { assertPropDefinitionsObject } from "./builtin-keys";
import type { HostPropDefinitions } from "./types";

/** The v2 call shapes that argument errors name. */
const INIT_HOST_CALL_SHAPE =
	"initHost(Component, { consumerOrigins }) or initHost({ props, consumerOrigins })";

/**
 * Removed `initHost()` option names, each with its replacement, so they can
 * be retired in one place.
 */
const REMOVED_INIT_HOST_OPTIONS: Readonly<Record<string, string>> = {
	allowedConsumerDomains:
		'initHost() option "allowedConsumerDomains" was renamed to consumerOrigins.',
};

/** What a valid `initHost()` call starts the host with. */
export interface HostStartOptions {
	/** The tag the component form requires; absent for the tag-agnostic form. */
	componentTag?: string;
	/** The definitions the host validates with, or `"unchecked"`. */
	props: HostPropDefinitions<Record<string, unknown>>;
	/**
	 * The component's `exports` schema, checked before each export is sent;
	 * absent for the tag-agnostic form.
	 */
	exportsSchema?: StandardSchemaV1;
	consumerOrigins: OriginMatcher;
	autoInit: boolean;
}

/** Builds an argument error that ends with the v2 call shapes. */
function callShapeError(message: string): ForgeFrameError {
	return new ForgeFrameError(
		"VALIDATION",
		`${message} Use ${INIT_HOST_CALL_SHAPE}.`,
	);
}

/**
 * Checks the call shape and resolves what the host starts with.
 *
 * @throws ForgeFrameError `VALIDATION` for a bare call, a non-ForgeFrame component, v1
 * positional arguments, an unknown option, or an invalid option value
 */
export function readInitHostArguments(
	args: readonly unknown[],
): HostStartOptions {
	const [first, second] = args;
	if (typeof first === "function") {
		const componentOptions = getComponentOptions(first);
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
			// A component without props declares none, so its host accepts none.
			props: (componentOptions.props ??
				EMPTY_PROP_DEFINITIONS) as PropsDefinition<Record<string, unknown>>,
			exportsSchema: componentOptions.exports,
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
		if (Object.hasOwn(REMOVED_INIT_HOST_OPTIONS, key))
			throw callShapeError(REMOVED_INIT_HOST_OPTIONS[key] as string);
		if (key !== "consumerOrigins" && key !== "autoInit" && key !== "props") {
			throw callShapeError(`initHost() does not accept the "${key}" option.`);
		}
	}
	const { consumerOrigins, autoInit, props } = value as Record<string, unknown>;
	if (consumerOrigins === undefined) {
		throw callShapeError(
			"initHost() requires consumerOrigins, the consumer origins allowed to embed this host; pass '*' to allow any origin. See https://github.com/jshsmth/forgeframe#origin-security.",
		);
	}
	try {
		assertOriginMatcher(
			consumerOrigins,
			"initHost() consumerOrigins",
			"allowed",
		);
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
		assertPropDefinitionsObject(props);
	}
	return {
		consumerOrigins: consumerOrigins as OriginMatcher,
		autoInit: autoInit ?? true,
		// A tag-agnostic host without props keeps every field unchecked.
		props:
			(props as PropsDefinition<Record<string, unknown>> | undefined) ??
			"unchecked",
	};
}
