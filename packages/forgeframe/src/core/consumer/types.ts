import type { ContextType } from "../../constants";
import type { PropsDefinition } from "../../types/props";
import type { ComponentOptions } from "../../types/runtime";
import type { Dimensions } from "../../types/utility";

/**
 * Normalized and validated component options.
 * @internal
 */
export interface NormalizedOptions<P extends Record<string, unknown>> {
	tag: string;
	url: string | ((props: P) => string);
	props: PropsDefinition<P>;
	context: ContextType;
	dimensions: Dimensions | ((props: P) => Dimensions);
	initTimeout: number;
	hostOrigins?: ComponentOptions<P>["hostOrigins"];
	peers?: ComponentOptions<P>["peers"];
	sandbox?: ComponentOptions<P>["sandbox"];
	containerTemplate?: ComponentOptions<P>["containerTemplate"];
	prerenderTemplate?: ComponentOptions<P>["prerenderTemplate"];
	validate?: ComponentOptions<P>["validate"];
	attributes?: ComponentOptions<P>["attributes"];
	style?: ComponentOptions<P>["style"];
	cspNonce?: string;
	/** The component's `exports` option: a schema, not exported values. */
	exportsSchema?: ComponentOptions<P>["exports"];
}
