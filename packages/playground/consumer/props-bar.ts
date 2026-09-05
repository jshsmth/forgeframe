/**
 * Dynamic props bar for ForgeFrame Playground
 */
import { elements } from "./elements";
import { log } from "./logger";
import {
	addPropToConfig,
	currentPropValues,
	deletePropValue,
	instance,
	removePropFromConfig,
	setPropValue,
} from "./state";
import type { DynamicProps, PlaygroundConfig } from "./types";

// Callback for when config changes (set by main.ts)
let onConfigChange: (() => void) | null = null;

export function setOnConfigChange(callback: () => void) {
	onConfigChange = callback;
}

export function getDefaultValue(propDef: Record<string, unknown>): unknown {
	if (propDef.default !== undefined) return propDef.default;
	const type = ((propDef.type as string) || "").toLowerCase();
	switch (type) {
		case "string":
			return "";
		case "number":
			return 0;
		case "boolean":
			return false;
		default:
			return "";
	}
}

export function renderPropsBar(config: PlaygroundConfig) {
	const props = config.props || {};

	// Initialize prop values from config defaults
	for (const [key, def] of Object.entries(props)) {
		if (currentPropValues[key] === undefined) {
			setPropValue(key, getDefaultValue(def as Record<string, unknown>));
		}
	}

	// Remove props that are no longer in config
	for (const key of Object.keys(currentPropValues)) {
		if (!(key in props)) {
			deletePropValue(key);
		}
	}

	const isRendered = instance !== null;

	const propsHtml = Object.entries(props)
		.map(([key, def]) => {
			const propDef = def as Record<string, unknown>;
			const type = ((propDef.type as string) || "").toLowerCase();
			const value = currentPropValues[key] ?? getDefaultValue(propDef);
			const inputType = type === "number" ? "number" : "text";

			return `
        <div class="prop-item">
          <label>${key}</label>
          <input type="${inputType}" data-prop="${key}" value="${value}" />
          <button data-update-prop="${key}">Set</button>
          ${!isRendered ? `<button class="btn-remove-prop" data-remove-prop="${key}" title="Remove prop">&times;</button>` : ""}
        </div>
      `;
		})
		.join("");

	const addPropHtml = !isRendered
		? `
    <div class="add-prop-container">
      <button class="btn-add-prop" id="btn-add-prop">+ Add Prop</button>
      <div class="add-prop-form" id="add-prop-form" style="display: none;">
        <input type="text" id="new-prop-name" placeholder="name" />
        <select id="new-prop-type">
          <option value="string">string</option>
          <option value="number">number</option>
          <option value="boolean">boolean</option>
        </select>
        <button id="btn-confirm-add">Add</button>
        <button id="btn-cancel-add">&times;</button>
      </div>
    </div>
  `
		: "";

	elements.propsBar.innerHTML = propsHtml + addPropHtml;

	// Bind update buttons
	elements.propsBar
		.querySelectorAll("button[data-update-prop]")
		.forEach((btn) => {
			btn.addEventListener("click", async () => {
				const propName = (btn as HTMLButtonElement).dataset.updateProp!;
				const input = elements.propsBar.querySelector(
					`input[data-prop="${propName}"]`,
				) as HTMLInputElement;
				if (!input) return;

				const propDef = props[propName] as Record<string, unknown>;
				let value: unknown = input.value;

				const type = ((propDef.type as string) || "").toLowerCase();
				if (type === "number") {
					value = parseFloat(input.value) || 0;
				} else if (type === "boolean") {
					value = input.value === "true";
				}

				setPropValue(propName, value);

				if (instance) {
					await instance.updateProps({
						[propName]: value,
					} as Partial<DynamicProps>);
					log(`Updated ${propName} to: ${value}`, "info");
				}
			});
		});

	// Update prop values on input change
	elements.propsBar.querySelectorAll("input[data-prop]").forEach((input) => {
		input.addEventListener("change", () => {
			const propName = (input as HTMLInputElement).dataset.prop!;
			const propDef = props[propName] as Record<string, unknown>;
			let value: unknown = (input as HTMLInputElement).value;

			const type = ((propDef.type as string) || "").toLowerCase();
			if (type === "number") {
				value = parseFloat((input as HTMLInputElement).value) || 0;
			} else if (type === "boolean") {
				value = (input as HTMLInputElement).value === "true";
			}

			setPropValue(propName, value);
		});
	});

	// Add prop button and form handlers (only when not rendered)
	if (!isRendered) {
		const btnAddProp = document.getElementById("btn-add-prop");
		const addPropForm = document.getElementById("add-prop-form");
		const btnConfirmAdd = document.getElementById("btn-confirm-add");
		const btnCancelAdd = document.getElementById("btn-cancel-add");
		const newPropName = document.getElementById(
			"new-prop-name",
		) as HTMLInputElement;
		const newPropType = document.getElementById(
			"new-prop-type",
		) as HTMLSelectElement;

		btnAddProp?.addEventListener("click", () => {
			if (addPropForm && btnAddProp) {
				btnAddProp.style.display = "none";
				addPropForm.style.display = "flex";
				newPropName?.focus();
			}
		});

		btnCancelAdd?.addEventListener("click", () => {
			if (addPropForm && btnAddProp) {
				addPropForm.style.display = "none";
				btnAddProp.style.display = "inline-flex";
				if (newPropName) newPropName.value = "";
			}
		});

		btnConfirmAdd?.addEventListener("click", () => {
			const name = newPropName?.value.trim();
			const type = newPropType?.value || "string";

			if (!name) {
				log("Prop name is required", "error");
				return;
			}

			if (props[name]) {
				log(`Prop "${name}" already exists`, "error");
				return;
			}

			// Add the prop to config
			const defaultValue =
				type === "number" ? 0 : type === "boolean" ? false : "";
			addPropToConfig(name, type, defaultValue);
			setPropValue(name, defaultValue);

			log(`Added prop: ${name} (${type})`, "success");

			// Trigger re-render and code update
			onConfigChange?.();
		});

		// Remove prop buttons
		elements.propsBar
			.querySelectorAll("button[data-remove-prop]")
			.forEach((btn) => {
				btn.addEventListener("click", () => {
					const propName = (btn as HTMLButtonElement).dataset.removeProp!;
					removePropFromConfig(propName);
					log(`Removed prop: ${propName}`, "info");
					onConfigChange?.();
				});
			});
	}
}
