/**
 * Logging and status utilities for ForgeFrame Playground
 */
import { elements } from "./elements";

export type LogType = "default" | "error" | "success" | "info";

export function log(message: string, type: LogType = "default") {
	const time = new Date().toLocaleTimeString();
	const entry = document.createElement("div");
	entry.className = `log-entry ${type}`;
	entry.innerHTML = `<span class="time">${time}</span><span class="message">${message}</span>`;
	elements.eventLog.appendChild(entry);
	elements.eventLog.scrollTop = elements.eventLog.scrollHeight;
	console.log(`[${time}] ${message}`);
}

export function setStatus(
	status: string,
	state: "idle" | "rendered" | "error" = "idle",
) {
	elements.statusText.textContent = status;
	elements.statusDot.className = "status-dot";
	if (state !== "idle") {
		elements.statusDot.classList.add(state);
	}
}

export function setButtonsEnabled(rendered: boolean) {
	elements.btnRender.disabled = rendered;
	elements.btnClose.disabled = !rendered;
	elements.btnFocus.disabled = !rendered;
	elements.btnShow.disabled = !rendered;
	elements.btnHide.disabled = !rendered;
	elements.container.classList.toggle("has-component", rendered);
}

export function clearLog() {
	elements.eventLog.innerHTML = "";
}
