// The public specifiers resolve to the production build, so both entries
// share one core instance as they do for package users.
import { create, prop } from "forgeframe";
import { createReactComponent, type ReactInstance } from "forgeframe/react";
import * as React from "react";
import { createRoot } from "react-dom/client";

/** Browser-owned observations exposed to the Playwright consumer. */
interface ReactJourneySnapshot {
	instances: number;
	rendered: number;
	errors: string[];
	setups: number;
	cleanups: number;
	hasRef: boolean;
	hasInstance: boolean;
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
// A delayed host keeps the frame loading, so commits can land before it is ready.
const hostDelay = params.get("hostDelay");
const Component = create({
	tag: "browser-react-journey",
	url: hostDelay ? `${hostOrigin}/?delay=${hostDelay}` : hostOrigin,
	props: {
		label: prop.string(),
		count: prop.number().min(0),
		theme: prop.string().default("light"),
		onAction: prop.function<(message: string) => string>(),
	},
	exports: prop.object({ greet: prop.function<(name: string) => string>() }),
});
const Wrapped = createReactComponent(Component);
const root = createRoot(mount);
const ref = React.createRef<HTMLDivElement>();
const instanceRef =
	React.createRef<ReactInstance<{ greet: (name: string) => string }>>();
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

function render(label: string, count: number, theme?: string): void {
	const content = React.createElement(
		React.Fragment,
		null,
		React.createElement(EffectProbe),
		React.createElement(Wrapped, {
			label,
			count,
			theme,
			ref,
			instanceRef,
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
	?.addEventListener("click", () => render("initial", 1, "dark"));
document
	.getElementById("update")
	?.addEventListener("click", () => render("updated", 2, "dark"));
document
	.getElementById("invalid")
	?.addEventListener("click", () => render("invalid", -1, "dark"));
document
	.getElementById("recover")
	?.addEventListener("click", () => render("recovered", 3, "dark"));
document
	.getElementById("default-theme")
	?.addEventListener("click", () => render("recovered", 3));
// Reaches the rendered instance through instanceRef: an exported method, then resize.
document.getElementById("use-instance")?.addEventListener("click", async () => {
	const handle = instanceRef.current;
	const output = document.getElementById("instance-result");
	if (!handle || !output) return;
	const greeting = await handle.exports?.greet("react");
	handle.resize({ width: 320, height: 180 });
	output.textContent = `${greeting}`;
});
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
		hasInstance: instanceRef.current !== null,
	}),
};
