import * as React from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create, destroyAll } from "@/core/component";
import { createReactComponent } from "@/drivers/react";
import { prop } from "@/props/prop";

describe("React driver with React DOM", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await React.act(async () => root.unmount());
		container.remove();
		await destroyAll();
		vi.unstubAllGlobals();
	});

	it("reports construction errors locally without unmounting sibling content", async () => {
		const failure = new Error("normalizer failed");
		const Component = create({
			tag: "react-construction-failure",
			url: "https://example.com",
			props: {
				name: {
					schema: prop.string(),
					decorate: () => {
						throw failure;
					},
				},
			},
		});
		const Wrapped = createReactComponent(Component, { React });
		const onError = vi.fn();

		await React.act(async () => {
			root.render(
				React.createElement(
					"section",
					null,
					React.createElement("span", null, "Other application content"),
					React.createElement(Wrapped, { name: "test", onError }),
				),
			);
		});

		expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
		expect(container.querySelector("span")?.textContent).toBe(
			"Other application content",
		);
		expect(container.textContent).toContain("Error: normalizer failed");
	});
});
