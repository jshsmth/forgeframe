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
}

export function setModalOverlay(overlay: HTMLElement | null) {
	modalOverlay = overlay;
}

export function setModalBody(body: HTMLElement | null) {
	modalBody = body;
}

export function resetPropValues() {
	currentPropValues = {};
}

export function setPropValue(key: string, value: unknown) {
	currentPropValues[key] = value;
}

export function deletePropValue(key: string) {
	delete currentPropValues[key];
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
