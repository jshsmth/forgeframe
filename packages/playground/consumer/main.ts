/**
 * ForgeFrame Playground - Consumer
 *
 * Interactive playground for testing ForgeFrame components.
 */

import { updateCodePreview } from "./code-generator";
import { DEFAULT_CONFIG } from "./config";
import { updateConfigurationStatus } from "./configuration-status";
import { elements } from "./elements";
import { clearLog, log } from "./logger";
import {
	renderPropsBar,
	setOnConfigChange,
	setOnPropValuesChange,
} from "./props-bar";
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
setOnPropValuesChange(() => {
	updateCodePreview(currentConfig, currentContext, currentIframeStyle);
});

// ============================================================================
// Mode Toggle
// ============================================================================

function updateIframeStyleVisibility() {
	elements.styleButtons.forEach((button) => {
		button.disabled = currentContext === "popup";
	});
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
			b.setAttribute("aria-pressed", "false");
		});
		btn.classList.add("active");
		btn.setAttribute("aria-pressed", "true");
		setCurrentContext(btn.dataset.context as RenderContext);
		updateIframeStyleVisibility();
		updateCodePreview(currentConfig, currentContext, currentIframeStyle);
		updateConfigurationStatus();
		log(`Context changed to: ${currentContext}`, "info");
	});
});

elements.styleButtons.forEach((btn) => {
	btn.addEventListener("click", () => {
		if (btn.disabled) return;
		elements.styleButtons.forEach((b) => {
			b.classList.remove("active");
			b.setAttribute("aria-pressed", "false");
		});
		btn.classList.add("active");
		btn.setAttribute("aria-pressed", "true");
		setCurrentIframeStyle(btn.dataset.style as IframeStyle);
		updateCodePreview(currentConfig, currentContext, currentIframeStyle);
		updateConfigurationStatus();
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

document
	.getElementById("btn-copy-code")
	?.addEventListener("click", async () => {
		const feedback = document.getElementById("copy-status");
		try {
			await navigator.clipboard.writeText(
				elements.codeOutput.textContent ?? "",
			);
			if (feedback) feedback.textContent = "Copied.";
		} catch {
			const selection = window.getSelection();
			const range = document.createRange();
			range.selectNodeContents(elements.codeOutput);
			selection?.removeAllRanges();
			selection?.addRange(range);
			if (feedback)
				feedback.textContent =
					"Code selected. Press Ctrl+C or Command+C to copy.";
		}
	});

// ============================================================================
// Initialize
// ============================================================================

function init() {
	// Scrollable evidence regions need a keyboard focus target for arrow-key scrolling.
	for (const region of document.querySelectorAll<HTMLElement>(
		".code-preview, #event-log",
	))
		region.tabIndex = 0;
	renderPropsBar(DEFAULT_CONFIG);
	updateCodePreview(DEFAULT_CONFIG, currentContext, currentIframeStyle);
	updateConfigurationStatus();
	const narrowViewport = window.matchMedia("(max-width: 900px)");
	const codePanel = document.querySelector<HTMLDetailsElement>(".code-panel");
	const updateCodeDisclosure = () => {
		if (codePanel) codePanel.open = !narrowViewport.matches;
	};
	updateCodeDisclosure();
	narrowViewport.addEventListener("change", updateCodeDisclosure);

	const headerInfo = document.getElementById("header-info");
	if (headerInfo) {
		const consumerUrl = new URL(window.location.href).host;
		const hostUrl = new URL(currentConfig.url).host;
		headerInfo.textContent = `${consumerUrl} → ${hostUrl}`;
	}

	log("Playground ready", "success");
}

init();
