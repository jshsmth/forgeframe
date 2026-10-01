/**
 * State management for ForgeFrame Playground
 */
import type {
	ForgeFrameComponent,
	ForgeFrameComponentInstance,
} from "forgeframe";
import { DEFAULT_CONFIG } from "./config";
import type {
	DynamicProps,
	IframeStyle,
	PlaygroundConfig,
	RenderContext,
} from "./types";

// Current state
export let currentContext: RenderContext = "iframe";
export let currentIframeStyle: IframeStyle = "embedded";
export let currentConfig: PlaygroundConfig = { ...DEFAULT_CONFIG };
export let instance: ForgeFrameComponentInstance<DynamicProps> | null = null;
export let modalOverlay: HTMLElement | null = null;
export let modalBody: HTMLElement | null = null;
export let currentPropValues: Record<string, unknown> = {};

// Raw editor text and parse outcome are separate from the last valid typed value.
export let propInputDrafts: Record<string, { text: string; valid: boolean }> =
	{};

export function recordPropInputDraft(
	key: string,
	text: string,
	valid: boolean,
) {
	propInputDrafts[key] = { text, valid };
}

export interface RunningConfiguration {
	context: RenderContext;
	style: IframeStyle;
	props: Record<string, string>;
}

export let runningConfiguration: RunningConfiguration | null = null;

export function describePropValue(value: unknown): string {
	return typeof value === "function"
		? "Callback"
		: (JSON.stringify(value) ?? "undefined");
}

export function recordRunningConfiguration(
	context: RenderContext,
	style: IframeStyle,
	props: Record<string, unknown>,
) {
	runningConfiguration = {
		context,
		style,
		props: Object.fromEntries(
			Object.entries(props).map(([key, value]) => [
				key,
				describePropValue(value),
			]),
		),
	};
}

export function recordAppliedProp(key: string, value: unknown) {
	if (runningConfiguration)
		runningConfiguration.props[key] = describePropValue(value);
}

// Cache created components to avoid re-registration errors
export const componentCache = new Map<
	string,
	ForgeFrameComponent<DynamicProps>
>();

// State setters
export function setCurrentContext(context: RenderContext) {
	currentContext = context;
}

export function setCurrentIframeStyle(style: IframeStyle) {
	currentIframeStyle = style;
}

export function setCurrentConfig(config: PlaygroundConfig) {
	currentConfig = config;
}

export function setInstance(
	inst: ForgeFrameComponentInstance<DynamicProps> | null,
) {
	instance = inst;
	if (!inst) runningConfiguration = null;
}

export function setModalOverlay(overlay: HTMLElement | null) {
	modalOverlay = overlay;
}

export function setModalBody(body: HTMLElement | null) {
	modalBody = body;
}

export function resetPropValues() {
	currentPropValues = {};
	propInputDrafts = {};
}

export function setPropValue(key: string, value: unknown) {
	currentPropValues[key] = value;
}

export function deletePropValue(key: string) {
	delete currentPropValues[key];
	delete propInputDrafts[key];
}

export function addPropToConfig(
	name: string,
	type: string,
	defaultValue?: unknown,
) {
	if (!currentConfig.props) {
		currentConfig.props = {};
	}
	currentConfig.props[name] = {
		type,
		...(defaultValue !== undefined ? { default: defaultValue } : {}),
	};
}

export function removePropFromConfig(name: string) {
	if (currentConfig.props) {
		delete currentConfig.props[name];
	}
	deletePropValue(name);
}
