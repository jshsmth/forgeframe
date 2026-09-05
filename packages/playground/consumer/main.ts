/**
 * ForgeFrame Playground - Consumer
 *
 * Interactive playground for testing ForgeFrame components.
 */

import { updateCodePreview } from "./code-generator";
import { DEFAULT_CONFIG } from "./config";
import { elements } from "./elements";
import { clearLog, log } from "./logger";
import { renderPropsBar, setOnConfigChange } from "./props-bar";
import { renderComponent } from "./renderer";
import {
	currentConfig,
	currentContext,
	currentIframeStyle,
	instance,
	setCurrentContext,
	setCurrentIframeStyle,
} from "./state";
import type { IframeStyle, RenderContext } from "./types";

// Callback when props config changes (add/remove prop)
function handleConfigChange() {
	renderPropsBar(currentConfig);
	updateCodePreview(currentConfig, currentContext, currentIframeStyle);
}

setOnConfigChange(handleConfigChange);

// ============================================================================
// Mode Toggle
// ============================================================================

function updateIframeStyleVisibility() {
	if (currentContext === "popup") {
		elements.iframeStyleGroup.classList.add("disabled");
	} else {
		elements.iframeStyleGroup.classList.remove("disabled");
	}
}

elements.contextButtons.forEach((btn) => {
	btn.addEventListener("click", () => {
		elements.contextButtons.forEach((b) => {
			b.classList.remove("active");
		});
		btn.classList.add("active");
		setCurrentContext(btn.dataset.context as RenderContext);
		updateIframeStyleVisibility();
		updateCodePreview(currentConfig, currentContext, currentIframeStyle);
		log(`Context changed to: ${currentContext}`, "info");
	});
});

elements.styleButtons.forEach((btn) => {
	btn.addEventListener("click", () => {
		elements.styleButtons.forEach((b) => {
			b.classList.remove("active");
		});
		btn.classList.add("active");
		setCurrentIframeStyle(btn.dataset.style as IframeStyle);
		updateCodePreview(currentConfig, currentContext, currentIframeStyle);
		log(`Iframe style changed to: ${currentIframeStyle}`, "info");
	});
});

// ============================================================================
// Event Handlers
// ============================================================================

elements.btnRender.addEventListener("click", () => renderComponent());

elements.btnClose.addEventListener("click", () => {
	instance?.close();
});

elements.btnFocus.addEventListener("click", () => {
	instance?.focus();
	log("Focus requested", "info");
});

elements.btnShow.addEventListener("click", () => {
	instance?.show();
	log("Show requested", "info");
});

elements.btnHide.addEventListener("click", () => {
	instance?.hide();
	log("Hide requested", "info");
});

elements.btnClearLog.addEventListener("click", clearLog);

// ============================================================================
// Initialize
// ============================================================================

function init() {
	renderPropsBar(DEFAULT_CONFIG);
	updateCodePreview(DEFAULT_CONFIG, currentContext, currentIframeStyle);

	const headerInfo = document.getElementById("header-info");
	if (headerInfo) {
		const consumerUrl = new URL(window.location.href).host;
		const hostUrl = new URL(currentConfig.url).host;
		headerInfo.textContent = `${consumerUrl} → ${hostUrl}`;
	}

	log("Playground ready", "success");
}

init();
