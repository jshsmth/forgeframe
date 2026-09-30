import { describe, expect, it } from "vitest";
import {
	buildPopupFeatures,
	nextPopupPollInterval,
} from "@/render/popup-layout";

describe("popup layout and polling policy", () => {
	it("centres from supplied screen observations, including negative screen coordinates", () => {
		expect(
			buildPopupFeatures(501, 601, {
				screenX: -1200,
				screenY: 20,
				outerWidth: 1000,
				outerHeight: 800,
			}),
		).toBe(
			"width=501,height=601,left=-951,top=119,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes",
		);
	});
	it("caps backoff while preserving the configured multiplier", () => {
		expect(nextPopupPollInterval(100, 1.5, 2000)).toBe(150);
		expect(nextPopupPollInterval(1800, 1.5, 2000)).toBe(2000);
		expect(nextPopupPollInterval(2000, 1.5, 2000)).toBe(2000);
	});
});
