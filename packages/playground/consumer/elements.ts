/**
 * DOM element references for ForgeFrame Playground
 */

export const elements = {
	codeOutput: document.getElementById("code-output") as HTMLElement,
	eventLog: document.getElementById("event-log") as HTMLDivElement,
	statusDot: document.getElementById("status-dot") as HTMLSpanElement,
	statusText: document.getElementById("status-text") as HTMLSpanElement,
	container: document.getElementById("component-container") as HTMLDivElement,
	propsBar: document.getElementById("props-bar") as HTMLDivElement,
	btnRender: document.getElementById("btn-render") as HTMLButtonElement,
	btnClose: document.getElementById("btn-close") as HTMLButtonElement,
	btnFocus: document.getElementById("btn-focus") as HTMLButtonElement,
	btnShow: document.getElementById("btn-show") as HTMLButtonElement,
	btnHide: document.getElementById("btn-hide") as HTMLButtonElement,
	btnClearLog: document.getElementById("btn-clear-log") as HTMLButtonElement,
	contextButtons: document.querySelectorAll(
		"[data-context]",
	) as NodeListOf<HTMLButtonElement>,
	styleButtons: document.querySelectorAll(
		"[data-style]",
	) as NodeListOf<HTMLButtonElement>,
	iframeStyleGroup: document.getElementById(
		"iframe-style-group",
	) as HTMLDivElement,
};
