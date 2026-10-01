import * as React from "react";
import { createRoot } from "react-dom/client";
import { create, createReactComponent, prop } from "../../src/index";

/** Browser-owned observations exposed to the Playwright consumer. */
export interface ReactJourneySnapshot {
	instances: number;
	rendered: number;
	errors: string[];
	setups: number;
	cleanups: number;
	hasRef: boolean;
}

declare global {
	interface Window {
		reactJourney: { snapshot(): ReactJourneySnapshot };
	}
}

const params = new URLSearchParams(location.search);
const hostOrigin = params.get("host");
const mount = document.getElementById("mount");
if (!hostOrigin || !mount)
	throw new Error("Missing React journey configuration");
const Component = create({
	tag: "browser-react-journey",
	url: hostOrigin,
	props: {
		label: prop.string(),
		count: prop.number().min(0),
		onAction: prop.function<(message: string) => string>(),
	},
});
const Wrapped = createReactComponent(Component, { React });
const root = createRoot(mount);
const ref = React.createRef<HTMLDivElement>();
let rendered = 0;
let setups = 0;
let cleanups = 0;
const errors: string[] = [];

// Establish that the browser bundle really executes development effect replay.
function EffectProbe(): React.ReactElement {
	React.useEffect(() => {
		setups += 1;
		return () => {
			cleanups += 1;
		};
	}, []);
	return React.createElement("span", { "data-effect-probe": true });
}

function render(label: string, count: number): void {
	const content = React.createElement(
		React.Fragment,
		null,
		React.createElement(EffectProbe),
		React.createElement(Wrapped, {
			label,
			count,
			ref,
			onAction: (message: string) => {
				const result = `${label}:${message}`;
				const output = document.getElementById("callback");
				if (output) output.textContent = result;
				return result;
			},
			onRendered: () => {
				rendered += 1;
			},
			onError: (error: Error) => {
				errors.push(error.message);
			},
		}),
	);
	root.render(
		params.get("strict") === "true"
			? React.createElement(React.StrictMode, null, content)
			: content,
	);
}

document
	.getElementById("start")
	?.addEventListener("click", () => render("initial", 1));
document
	.getElementById("update")
	?.addEventListener("click", () => render("updated", 2));
document
	.getElementById("invalid")
	?.addEventListener("click", () => render("invalid", -1));
document
	.getElementById("recover")
	?.addEventListener("click", () => render("recovered", 3));
document
	.getElementById("unmount")
	?.addEventListener("click", () => root.unmount());
window.reactJourney = {
	snapshot: () => ({
		instances: Component.instances.length,
		rendered,
		errors: [...errors],
		setups,
		cleanups,
		hasRef: ref.current !== null,
	}),
};
