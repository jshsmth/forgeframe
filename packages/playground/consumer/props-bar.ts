/**
 * Dynamic props bar for ForgeFrame Playground
 */
import { requireValue } from "../require-value";
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
		case "array":
			return [];
		case "object":
			return {};
		case "function":
			return (...args: unknown[]) =>
				log(`Callback: ${args.map(String).join(", ")}`, "info");
		default:
			return "";
	}
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => {
		const entities: Record<string, string> = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#39;",
		};
		return entities[character];
	});
}

export function parsePropInput(
	input: HTMLInputElement,
	type: string,
	previous: unknown,
): unknown {
	if (type === "function") return previous;
	if (type === "boolean") {
		if (input.value !== "true" && input.value !== "false")
			throw new Error("Expected true or false");
		return input.value === "true";
	}
	if (type === "number") {
		const value = Number(input.value);
		if (!input.value.trim() || !Number.isFinite(value))
			throw new Error("Expected a finite number");
		return value;
	}
	if (type === "array" || type === "object") {
		const value: unknown = JSON.parse(input.value);
		if (
			type === "array"
				? !Array.isArray(value)
				: !value || typeof value !== "object" || Array.isArray(value)
		) {
			throw new Error(`Expected a JSON ${type}`);
		}
		return value;
	}
	return input.value;
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
		if (!Object.hasOwn(props, key)) {
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
			const displayValue =
				typeof value === "object" ? JSON.stringify(value) : String(value);
			const safeKey = escapeHtml(key);

			return `
        <div class="prop-item">
          <label>${safeKey}</label>
          <input type="${inputType}" data-prop="${safeKey}" value="${escapeHtml(displayValue)}" ${type === "function" ? "readonly" : ""} />
          <button data-update-prop="${safeKey}">Set</button>
          ${!isRendered ? `<button class="btn-remove-prop" data-remove-prop="${safeKey}" title="Remove prop">&times;</button>` : ""}
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
				const propName = requireValue(
					(btn as HTMLButtonElement).dataset.updateProp,
				);
				const input = (btn as HTMLElement)
					.closest(".prop-item")
					?.querySelector("input") as HTMLInputElement;
				if (!input) return;

				const propDef = props[propName] as Record<string, unknown>;
				try {
					const type = ((propDef.type as string) || "").toLowerCase();
					const value = parsePropInput(
						input,
						type,
						currentPropValues[propName],
					);
					if (instance) {
						await instance.updateProps({
							[propName]: value,
						} as Partial<DynamicProps>);
						log(`Updated ${propName} to: ${input.value}`, "info");
					}
					setPropValue(propName, value);
					onConfigChange?.();
				} catch (error) {
					log(`Could not update ${propName}: ${String(error)}`, "error");
				}
			});
		});

	// Update prop values on input change
	elements.propsBar.querySelectorAll("input[data-prop]").forEach((input) => {
		input.addEventListener("change", () => {
			const propName = requireValue((input as HTMLInputElement).dataset.prop);
			const propDef = props[propName] as Record<string, unknown>;
			try {
				const type = ((propDef.type as string) || "").toLowerCase();
				setPropValue(
					propName,
					parsePropInput(
						input as HTMLInputElement,
						type,
						currentPropValues[propName],
					),
				);
				onConfigChange?.();
			} catch (error) {
				log(`Could not update ${propName}: ${String(error)}`, "error");
			}
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

			if (!name || ["__proto__", "constructor", "prototype"].includes(name)) {
				log("A non-reserved prop name is required", "error");
				return;
			}

			if (Object.hasOwn(props, name)) {
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
					const propName = requireValue(
						(btn as HTMLButtonElement).dataset.removeProp,
					);
					removePropFromConfig(propName);
					log(`Removed prop: ${propName}`, "info");
					onConfigChange?.();
				});
			});
	}
}
