import type { ContextType } from "../../constants";
import type { PropsDefinition } from "../../types/props";
import type { ComponentOptions } from "../../types/runtime";
import type { Dimensions } from "../../types/utility";

/**
 * Normalized and validated component options.
 * @internal
 */
export interface NormalizedOptions<
	P extends Record<string, unknown>,
	SchemaInputs = P,
> {
	tag: string;
	url: string | ((props: P) => string);
	props: PropsDefinition<P, SchemaInputs>;
	defaultContext: ContextType;
	dimensions: Dimensions | ((props: P) => Dimensions);
	timeout: number;
	domain?: ComponentOptions<P>["domain"];
	peerDomains?: ComponentOptions<P>["peerDomains"];
	containerTemplate?: ComponentOptions<P>["containerTemplate"];
	prerenderTemplate?: ComponentOptions<P>["prerenderTemplate"];
	validate?: ComponentOptions<P>["validate"];
	attributes?: ComponentOptions<P>["attributes"];
	style?: ComponentOptions<P>["style"];
	cspNonce?: string;
}
