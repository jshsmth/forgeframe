import { afterEach, describe, expect, it } from "vitest";
import {
	renderOverview,
	renderResults,
	setSuiteRunning,
} from "../../../playground/consumer/test-lab/ui";

afterEach(() => {
	document.body.replaceChildren();
	document.head.querySelector("#test-lab-styles")?.remove();
	delete document.body.dataset.testStatus;
});

describe("test lab failure investigation", () => {
	it("keeps execution running until completion and exposes the affected route without interpreting failure text as markup", () => {
		renderOverview();
		setSuiteRunning(true, "Running error transport");
		renderResults([
			{
				name: "Error transport: failed callback",
				detail: '<img src=x onerror="alert(1)">',
				status: "fail",
				scenarioId: "errors",
			},
			{
				name: "Consumer controls: cleanup",
				detail: "No remaining frames",
				status: "pass",
				scenarioId: "controls",
			},
		]);
		expect(document.body.dataset.testStatus).toBe("running");
		expect(document.querySelector("#failure-nav a")?.getAttribute("href")).toBe(
			"/tests/errors",
		);
		expect(
			document.querySelector(".result.fail .result-detail")?.textContent,
		).toContain('<img src=x onerror="alert(1)">');
		expect(document.querySelector("img")).toBeNull();
		document.getElementById("failed-results")?.click();
		expect(document.querySelectorAll(".result")).toHaveLength(1);
		expect(document.querySelector(".result-link")?.getAttribute("href")).toBe(
			"/tests/errors",
		);
		setSuiteRunning(false);
		expect(document.body.dataset.testStatus).toBe("failed");
		expect(document.getElementById("sandbox-state")?.textContent).toBe(
			"Completed · temporary components removed.",
		);
		document.getElementById("all-results")?.click();
		expect(document.querySelectorAll(".result")).toHaveLength(2);
	});
});
