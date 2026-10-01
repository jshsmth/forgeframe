import {
	currentContext,
	currentIframeStyle,
	currentPropValues,
	describePropValue,
	propInputDrafts,
	runningConfiguration,
} from "./state";

/** Keeps draft edits visibly separate from the configuration of the active instance. */
export function updateConfigurationStatus(): void {
	const running = runningConfiguration;
	const mode =
		currentContext === "popup" ? "Popup" : `Iframe / ${currentIframeStyle}`;
	const modeChanged =
		running &&
		(currentContext !== running.context ||
			(currentContext === "iframe" && currentIframeStyle !== running.style));
	let propsChanged = false;
	let invalidValues = false;
	let incompleteDraft = false;
	for (const input of document.querySelectorAll<HTMLInputElement>(
		"input[data-prop]",
	)) {
		const key = input.dataset.prop ?? "";
		invalidValues ||= input.getAttribute("aria-invalid") === "true";
		const invalidDraft = propInputDrafts[key]?.valid === false;
		incompleteDraft ||= invalidDraft;
		const changed =
			invalidDraft ||
			Boolean(
				running &&
					describePropValue(currentPropValues[key]) !== running.props[key],
			);
		propsChanged ||= changed;
		input.closest(".prop-item")?.classList.toggle("pending", changed);
		const applied = input.closest(".prop-item")?.querySelector(".prop-applied");
		if (applied)
			applied.textContent = running
				? `Applied: ${running.props[key] ?? "Not applied"}`
				: "";
	}
	const summary = document.getElementById("configuration-summary");
	if (summary) {
		summary.textContent = invalidValues
			? "Draft contains invalid values. Correct the highlighted fields before rendering or applying changes."
			: incompleteDraft
				? "Draft contains incomplete or invalid values. Finish editing before rendering or applying changes."
				: !running
					? `Draft: ${mode}. Render to start an instance.`
					: `Running: ${running.context === "popup" ? "Popup" : `Iframe / ${running.style}`}. ${modeChanged || propsChanged ? "Draft changes pending." : "Draft matches the running instance."}`;
		summary.classList.toggle(
			"pending",
			Boolean(modeChanged || propsChanged || invalidValues || incompleteDraft),
		);
	}
	const values = document.getElementById("running-props");
	if (values)
		values.textContent = running
			? Object.entries(running.props)
					.map(([key, value]) => `${key}: ${value}`)
					.join("\n")
			: "No instance running.";
}
