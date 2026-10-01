/**
 * Logging and status utilities for ForgeFrame Playground
 */
import { elements } from "./elements";

export type LogType = "default" | "error" | "success" | "info";

export function log(message: string, type: LogType = "default") {
	const time = new Date().toLocaleTimeString();
	const entry = document.createElement("div");
	entry.className = `log-entry ${type}`;
	const timestamp = document.createElement("span");
	timestamp.className = "time";
	timestamp.textContent = time;
	const text = document.createElement("span");
	text.className = "message";
	text.textContent = message;
	entry.append(timestamp, text);
	elements.eventLog.appendChild(entry);
	if (type === "error") {
		const announcement = document.getElementById("event-announcement");
		if (announcement) announcement.textContent = message;
	}
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
