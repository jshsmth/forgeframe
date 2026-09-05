/**
 * Integration tests covering canonical host synchronization for prop aliases.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { create, prop } from "@/index";
import type { PropsDefinition } from "@/types";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

interface AliasSyncProps {
	email: string;
}

interface AliasSyncInput {
	userEmail: string;
}

interface ChainedAliasSyncProps {
	first: string;
	second: string;
}

interface ChainedAliasSyncInput {
	legacy: string;
}

const ALIAS_PROP_DEFINITIONS: PropsDefinition<AliasSyncProps> = {
	email: {
		schema: prop.string(),
		required: true,
		alias: "userEmail",
	},
};

const CHAINED_ALIAS_PROP_DEFINITIONS: PropsDefinition<ChainedAliasSyncProps> = {
	first: {
		schema: prop.string(),
		required: true,
		alias: "second",
	},
	second: {
		schema: prop.string(),
		required: true,
		alias: "legacy",
	},
};

function withUserEmail(value: string): AliasSyncInput {
	return { userEmail: value };
}

describe("Prop alias sync integration", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	it("should send initial and updated alias values under the canonical key", async () => {
		harness = createIframeIntegrationHarness();

		const container = document.createElement("div");
		document.body.appendChild(container);

		const AliasComponent = create<AliasSyncProps, unknown, AliasSyncInput>({
			tag: "integration-props-alias-component",
			url: "https://host.example.com/widget",
			props: ALIAS_PROP_DEFINITIONS,
		});
		const instance = AliasComponent(withUserEmail("initial@example.com"));

		const renderPromise = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			ALIAS_PROP_DEFINITIONS,
		);

		await expect(renderPromise).resolves.toBeUndefined();
		expect(hostProps.email).toBe("initial@example.com");
		expect(hostProps).not.toHaveProperty("userEmail");

		const onProps = vi.fn();
		hostProps.onProps(onProps);

		await expect(
			instance.updateProps(withUserEmail("updated@example.com")),
		).resolves.toBeUndefined();

		expect(hostProps.email).toBe("updated@example.com");
		expect(hostProps.consumer.props.email).toBe("updated@example.com");
		expect(hostProps.consumer.props).not.toHaveProperty("userEmail");
		expect(onProps).toHaveBeenCalledTimes(1);
		expect(onProps.mock.calls[0][0]).toMatchObject({
			email: "updated@example.com",
		});
		expect(onProps.mock.calls[0][0]).not.toHaveProperty("userEmail");
	});

	it("should synchronize chained aliases under every canonical key", async () => {
		harness = createIframeIntegrationHarness();

		const container = document.createElement("div");
		document.body.appendChild(container);

		const ChainedAliasComponent = create<
			ChainedAliasSyncProps,
			unknown,
			ChainedAliasSyncInput
		>({
			tag: "integration-props-chained-alias-component",
			url: "https://host.example.com/widget",
			props: CHAINED_ALIAS_PROP_DEFINITIONS,
		});
		const instance = ChainedAliasComponent({ legacy: "v1" });

		const renderPromise = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			CHAINED_ALIAS_PROP_DEFINITIONS,
		);

		await expect(renderPromise).resolves.toBeUndefined();
		expect(hostProps.first).toBe("v1");
		expect(hostProps.second).toBe("v1");
		expect(hostProps).not.toHaveProperty("legacy");

		const onProps = vi.fn();
		hostProps.onProps(onProps);

		await expect(
			instance.updateProps({ legacy: "v2" }),
		).resolves.toBeUndefined();

		expect(hostProps.first).toBe("v2");
		expect(hostProps.second).toBe("v2");
		expect(hostProps.consumer.props).toMatchObject({
			first: "v2",
			second: "v2",
		});
		expect(hostProps.consumer.props).not.toHaveProperty("legacy");
		expect(onProps).toHaveBeenCalledTimes(1);
		expect(onProps.mock.calls[0][0]).toMatchObject({
			first: "v2",
			second: "v2",
		});
		expect(onProps.mock.calls[0][0]).not.toHaveProperty("legacy");
	});
});
