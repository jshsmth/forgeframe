/**
 * Default configuration for ForgeFrame Playground
 */
import type { PlaygroundConfig } from "./types";

export const DEFAULT_CONFIG: PlaygroundConfig = {
	tag: "playground-component",
	url: import.meta.env.VITE_HOST_URL || "https://localhost:5174/",
	dimensions: {
		width: "100%",
		height: "100%",
	},
	style: {
		border: "none",
		borderRadius: "8px",
	},
	modalStyle: {
		overlayBackground: "rgba(0, 0, 0, 0.5)",
		boxBackground: "#ffffff",
		borderRadius: "8px",
		boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
		width: 500,
		height: 400,
		headerBackground: "#fafafa",
		headerColor: "#333333",
		borderColor: "#e0e0e0",
	},
	props: {
		name: {
			type: "string",
			required: true,
		},
		count: {
			type: "number",
			default: 0,
		},
	},
};
