/**
 * Component rendering for ForgeFrame Playground
 */

import ForgeFrame, { type PropSchema, prop } from "forgeframe";
import { requireValue } from "../require-value";
import { getComponentDimensions } from "./config";
import { updateConfigurationStatus } from "./configuration-status";
import { elements } from "./elements";
import { log, setButtonsEnabled, setStatus } from "./logger";
import { renderPropsBar, validatePropInput } from "./props-bar";
import {
	componentCache,
	currentConfig,
	currentContext,
	currentIframeStyle,
	currentPropValues,
	instance,
	modalBody,
	modalOverlay,
	recordRunningConfiguration,
	setInstance,
	setModalBody,
	setModalOverlay,
	setPropValue,
} from "./state";
import type { DynamicProps, PlaygroundConfig } from "./types";

let componentSequence = 0;

/**
 * Maps string type names to prop schema builders
 */
function createPropSchema(
	typeStr: string,
	options: { required?: boolean; default?: unknown },
): PropSchema<unknown> {
	const { required, default: defaultValue } = options;

	let schema: PropSchema<unknown>;

	switch (typeStr.toUpperCase()) {
		case "NUMBER":
			schema = prop.number();
			break;
		case "BOOLEAN":
			schema = prop.boolean();
			break;
		case "FUNCTION":
			schema = prop.function();
			break;
		case "ARRAY":
			schema = prop.array();
			break;
		case "OBJECT":
			schema = prop.object();
			break;
		default:
			schema = prop.string();
			break;
	}

	if (defaultValue !== undefined) {
		schema = schema.default(defaultValue as never);
	}

	if (!required) {
		schema = schema.optional();
	}

	return schema;
}

export function buildPropsSchema(config: PlaygroundConfig) {
	const schema: Record<string, PropSchema<unknown>> = {};

	// Add user-defined props from config
	for (const [key, def] of Object.entries(config.props || {})) {
		const propDef = def as Record<string, unknown>;
		const typeStr = (propDef.type as string) || "STRING";

		schema[key] = createPropSchema(typeStr, {
			required: propDef.required as boolean,
			default: propDef.default,
		});
	}

	// Always add callback props (optional functions)
	schema.onGreet = prop.function().optional();
	schema.onClose = prop.function().optional();

	return schema;
}

export function createModalTemplate(config: PlaygroundConfig) {
	const cacheKey = `modal-${JSON.stringify(config)}`;
	if (componentCache.has(cacheKey)) {
		return requireValue(componentCache.get(cacheKey));
	}

	const ms = config.modalStyle || {};
	const modalWidth = ms.width || 500;
	const modalHeight = ms.height || 400;

	const component = ForgeFrame.create<DynamicProps>({
		tag: `${config.tag}-modal-${++componentSequence}`,
		url: config.url,
		dimensions: { width: modalWidth, height: modalHeight },
		style: {
			border: "none",
			borderRadius: `0 0 ${ms.borderRadius || "8px"} ${ms.borderRadius || "8px"}`,
			...config.style,
		},
		containerTemplate: ({ doc, frame, prerenderFrame, close, uid }) => {
			const overlay = doc.createElement("div");
			overlay.id = `forgeframe-modal-${uid}`;
			Object.assign(overlay.style, {
				position: "fixed",
				top: "0",
				left: "0",
				right: "0",
				bottom: "0",
				background: ms.overlayBackground || "rgba(0, 0, 0, 0.5)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: "10000",
			});

			overlay.addEventListener("click", (e) => {
				if (e.target === overlay) close();
			});

			const modal = doc.createElement("div");
			Object.assign(modal.style, {
				background: ms.boxBackground || "#fff",
				borderRadius: ms.borderRadius || "8px",
				boxShadow: ms.boxShadow || "0 20px 60px rgba(0, 0, 0, 0.3)",
				overflow: "hidden",
				border: `1px solid ${ms.borderColor || "#e0e0e0"}`,
			});

			const header = doc.createElement("div");
			Object.assign(header.style, {
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center",
				padding: "0.75rem 1rem",
				background: ms.headerBackground || "#fafafa",
				borderBottom: `1px solid ${ms.borderColor || "#eee"}`,
			});

			const title = doc.createElement("span");
			title.textContent = "ForgeFrame Component";
			Object.assign(title.style, {
				fontSize: "0.875rem",
				color: ms.headerColor || "#333",
				fontWeight: "500",
			});

			const closeBtn = doc.createElement("button");
			closeBtn.innerHTML = "&times;";
			Object.assign(closeBtn.style, {
				background: "none",
				border: "none",
				fontSize: "1.5rem",
				cursor: "pointer",
				color: "#888",
				padding: "0",
				lineHeight: "1",
			});
			closeBtn.addEventListener("click", () => close());

			header.appendChild(title);
			header.appendChild(closeBtn);

			const body = doc.createElement("div");
			Object.assign(body.style, {
				width: `${modalWidth}px`,
				height: `${modalHeight}px`,
				position: "relative",
			});

			if (prerenderFrame) body.appendChild(prerenderFrame);
			if (frame) body.appendChild(frame);

			modal.appendChild(header);
			modal.appendChild(body);
			overlay.appendChild(modal);

			setModalOverlay(overlay);
			setModalBody(body);
			return overlay;
		},
		props: buildPropsSchema(config),
	});

	componentCache.set(cacheKey, component);
	return component;
}

export function createComponent(
	config: PlaygroundConfig,
	context: "iframe" | "popup" = "iframe",
) {
	// Create fresh component with unique tag each time to avoid registration conflicts
	// (unlike modals which can be cached since they append to body fresh each time)
	const uniqueTag = `${config.tag}-${++componentSequence}`;

	const dimensions = getComponentDimensions(config, context);

	const component = ForgeFrame.create<DynamicProps>({
		tag: uniqueTag,
		url: config.url,
		dimensions,
		style: config.style as Record<string, string>,
		attributes: config.attributes,
		timeout: config.timeout,
		props: buildPropsSchema(config),
	});

	return component;
}

export async function renderComponent() {
	if (instance) {
		log("Component already rendered", "info");
		return;
	}

	const config = currentConfig;
	const context = currentContext;
	const iframeStyle = currentIframeStyle;

	const modeLabel = context === "popup" ? "popup" : `iframe (${iframeStyle})`;

	log(`Rendering as ${modeLabel}...`, "info");
	setStatus("Rendering...", "idle");

	try {
		// Validate every editor value before changing the shared snapshot.
		const inputs = Array.from(
			elements.propsBar.querySelectorAll<HTMLInputElement>("input[data-prop]"),
		);
		const values = inputs.map((input) => {
			const name = requireValue(input.dataset.prop);
			const definition = config.props?.[name] as
				| Record<string, unknown>
				| undefined;
			const type = ((definition?.type as string) || "").toLowerCase();
			return [
				name,
				validatePropInput(input, type, currentPropValues[name]),
			] as const;
		});
		for (const [name, value] of values) setPropValue(name, value);
		// Use modal template only for iframe context with modal style
		const useModal = context === "iframe" && iframeStyle === "modal";
		const Component = useModal
			? createModalTemplate(config)
			: createComponent(config, context);

		// Build props object with current values + callbacks
		const props: DynamicProps = {
			...currentPropValues,
			onGreet: (message: string) => {
				log(`Host says: ${message}`, "success");
			},
			onClose: () => {
				log("Host requested close", "info");
				instance?.close();
			},
			onError: (error: Error) => {
				log(`Host error: ${error.message}`, "error");
			},
		};

		const newInstance = Component(props);
		setInstance(newInstance);

		// Subscribe to events
		newInstance.event.on("rendered", () => {
			log("Event: rendered", "success");
		});
		newInstance.event.on("close", () => {
			log("Event: close", "info");
			setInstance(null);
			renderPropsBar(config);
			setStatus("Closed", "idle");
			setButtonsEnabled(false);
			updateConfigurationStatus();
			if (modalOverlay) {
				modalOverlay.remove();
				setModalOverlay(null);
				setModalBody(null);
			}
			// Clear container for embedded iframes (keep only the placeholder)
			if (!useModal) {
				const placeholder = elements.container.querySelector(
					".container-placeholder",
				);
				elements.container.innerHTML = "";
				if (placeholder) {
					elements.container.appendChild(placeholder);
				} else {
					const newPlaceholder = document.createElement("div");
					newPlaceholder.className = "container-placeholder";
					newPlaceholder.textContent = 'Click "Render" to load component';
					elements.container.appendChild(newPlaceholder);
				}
			}
		});
		newInstance.event.on("error", (err) => {
			log(`Event: error - ${err}`, "error");
		});
		newInstance.event.on("resize", (dims) => {
			log(`Event: resize - ${JSON.stringify(dims)}`, "info");
			// Also resize the modal body container if in modal mode
			if (useModal && modalBody && dims) {
				const { width, height } = dims as {
					width?: number | string;
					height?: number | string;
				};
				if (width !== undefined) {
					modalBody.style.width =
						typeof width === "number" ? `${width}px` : width;
				}
				if (height !== undefined) {
					modalBody.style.height =
						typeof height === "number" ? `${height}px` : height;
				}
			}
		});
		newInstance.event.on("focus", () => {
			log("Event: focus", "info");
		});

		const container = useModal ? document.body : "#component-container";

		await newInstance.render(container, context);
		recordRunningConfiguration(
			context,
			iframeStyle,
			Object.fromEntries(values),
		);

		setStatus("Rendered", "rendered");
		setButtonsEnabled(true);
		renderPropsBar(config);
		log(`Component rendered successfully (${modeLabel})`, "success");
	} catch (err) {
		log(`Render failed: ${err}`, "error");
		setStatus("Failed", "error");
		setInstance(null);
		updateConfigurationStatus();
		elements.propsBar
			.querySelector<HTMLInputElement>("[aria-invalid='true']")
			?.focus();
	}
}
