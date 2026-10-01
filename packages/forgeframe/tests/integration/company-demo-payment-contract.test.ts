import { afterEach, describe, expect, it } from "vitest";
import { create, prop } from "@/index";
import {
	type PaymentProps,
	paymentProps,
} from "../../../playground/payment/contract";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

const invalidAmounts = [-1, 17600.5, Number.MAX_SAFE_INTEGER + 1];

function invoiceProps(amountCents: number): PaymentProps {
	return {
		invoiceId: "PV-1042",
		amountCents,
		customer: "Demo customer",
		outcome: "success",
		onReady: () => {},
		onResult: () => ({ invoiceId: "PV-1042", status: "recorded" }),
	};
}

describe("company payment amount contract", () => {
	let harness: IframeIntegrationHarness | undefined;

	afterEach(async () => {
		await harness?.cleanup();
		harness = undefined;
	});

	it.each(invalidAmounts)(
		"rejects consumer invoice cents %s before opening a payment window",
		async (amount) => {
			harness = createIframeIntegrationHarness();
			const Payment = create<PaymentProps>({
				tag: "payment-consumer-amount-contract",
				url: "https://host.example.com/widget",
				props: paymentProps,
			});
			const container = document.createElement("div");
			document.body.append(container);
			await expect(
				Payment(invoiceProps(amount)).render(container),
			).rejects.toThrow(/amountCents/);
			expect(container.querySelector("iframe")).toBeNull();
		},
	);

	it.each(invalidAmounts)(
		"rejects host invoice cents %s from a permissive consumer",
		async (amount) => {
			harness = createIframeIntegrationHarness();
			const instance = create<PaymentProps>({
				tag: "payment-host-amount-contract",
				url: "https://host.example.com/widget",
				props: { ...paymentProps, amountCents: prop.number() },
			})(invoiceProps(amount));
			const container = document.createElement("div");
			document.body.append(container);
			const rendering = instance.render(container);
			void rendering.catch(() => {});
			const iframe = await harness.waitForIframe(container);
			harness.attachHostToIframe(iframe);
			const host = harness.bootstrapHost<PaymentProps>(paymentProps);
			if (!host) throw new Error("Missing payment host");
			await expect(host.ready).rejects.toThrow(/amountCents/);
		},
	);

	it.each([0, 17600, Number.MAX_SAFE_INTEGER])(
		"delivers valid cents %s and rejects invalid consumer updates",
		async (amount) => {
			harness = createIframeIntegrationHarness();
			const instance = create<PaymentProps>({
				tag: "payment-valid-amount-contract",
				url: "https://host.example.com/widget",
				props: paymentProps,
			})(invoiceProps(amount));
			const container = document.createElement("div");
			document.body.append(container);
			const rendering = instance.render(container);
			const { hostProps } = await harness.bootstrapIframeHost<PaymentProps>(
				container,
				paymentProps,
			);
			await rendering;
			expect(hostProps.amountCents).toBe(amount);
			for (const invalid of invalidAmounts) {
				await expect(
					instance.updateProps({ amountCents: invalid }),
				).rejects.toThrow(/amountCents/);
				expect(hostProps.amountCents).toBe(amount);
			}
			await instance.updateProps({ amountCents: 15400 });
			expect(hostProps.amountCents).toBe(15400);
		},
	);

	it("preserves the host amount after invalid remote updates and accepts a valid retry", async () => {
		harness = createIframeIntegrationHarness();
		const instance = create<PaymentProps>({
			tag: "payment-host-update-amount-contract",
			url: "https://host.example.com/widget",
			props: { ...paymentProps, amountCents: prop.number() },
		})(invoiceProps(17600));
		const container = document.createElement("div");
		document.body.append(container);
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost<PaymentProps>(
			container,
			paymentProps,
		);
		await rendering;
		for (const invalid of invalidAmounts) {
			await expect(
				instance.updateProps({ amountCents: invalid }),
			).rejects.toThrow(/amountCents/);
			expect(hostProps.amountCents).toBe(17600);
		}
		await instance.updateProps({ amountCents: 15400 });
		expect(hostProps.amountCents).toBe(15400);
	});
});
