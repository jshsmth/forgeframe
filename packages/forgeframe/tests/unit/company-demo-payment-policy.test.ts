import { describe, expect, it } from "vitest";
import {
	commitPaymentResult,
	type PaymentSessionState,
	paymentControls,
} from "../../../playground/consumer/company-demo/acceptance";
import {
	invoiceTotal,
	seedInvoices,
} from "../../../playground/consumer/company-demo/invoices";
import type {
	DemoReceipt,
	PaymentResult,
} from "../../../playground/payment/contract";
import {
	approvedPaymentResult,
	assertPaymentRecorded,
	normalizeDemoCardNumber,
	shouldDeclineAttempt,
} from "../../../playground/payment/simulation";

function sample() {
	const invoices = seedInvoices();
	const invoice = invoices[0];
	const session: PaymentSessionState = { invoice, cancelled: false };
	const receipt: DemoReceipt = {
		invoiceId: invoice.id,
		amountCents: invoiceTotal(invoice),
		transactionId: "HP-DEMO1234",
		paidAt: "2026-10-01T07:00:00Z",
		lastFour: "4242",
	};
	const result: PaymentResult = { status: "approved", receipt };
	return { invoices, invoice, session, receipt, result };
}

describe("merchant payment acceptance", () => {
	it("commits only the captured invoice before returning its acknowledgement", () => {
		const { invoices, invoice, session, receipt, result } = sample();
		const accepted = commitPaymentResult(session, session, result, 17600);
		expect(accepted).toEqual({
			phase: "approved",
			receipt,
			acknowledgement: { invoiceId: invoice.id, status: "recorded" },
		});
		expect(invoice.receipt).toBe(receipt);
		expect(invoices.slice(1).every((item) => item.receipt === null)).toBe(true);
	});

	it("acknowledges a decline without committing a receipt, then permits approval", () => {
		const { invoice, session, result } = sample();
		expect(
			commitPaymentResult(
				session,
				session,
				{
					status: "declined",
					invoiceId: invoice.id,
				},
				17600,
			),
		).toEqual({
			phase: "declined",
			acknowledgement: { invoiceId: invoice.id, status: "declined" },
		});
		expect(invoice.receipt).toBeNull();
		expect(commitPaymentResult(session, session, result, 17600).phase).toBe(
			"approved",
		);
	});

	it.each(["closed", "replaced", "cancelled"] as const)(
		"rejects a %s session",
		(state) => {
			const { invoice, session, result } = sample();
			const active =
				state === "closed"
					? null
					: state === "replaced"
						? { ...session }
						: session;
			if (state === "cancelled") session.cancelled = true;
			expect(() => commitPaymentResult(active, session, result, 17600)).toThrow(
				"This payment session has ended.",
			);
			expect(invoice.receipt).toBeNull();
		},
	);

	it("rejects a duplicate result without replacing the recorded receipt", () => {
		const { invoice, session, result, receipt } = sample();
		commitPaymentResult(session, session, result, 17600);
		expect(() =>
			commitPaymentResult(
				session,
				session,
				{
					status: "approved",
					receipt: { ...receipt, transactionId: "HP-DUPLICATE" },
				},
				17600,
			),
		).toThrow("This payment session has ended.");
		expect(invoice.receipt).toBe(receipt);
	});

	it.each([
		{ invoiceId: "PV-1043", amountCents: 17600 },
		{ invoiceId: "PV-1042", amountCents: 1 },
	])(
		"rejects mismatched approval metadata $invoiceId/$amountCents",
		(metadata) => {
			const { invoice, session, receipt } = sample();
			expect(() =>
				commitPaymentResult(
					session,
					session,
					{
						status: "approved",
						receipt: { ...receipt, ...metadata },
					},
					17600,
				),
			).toThrow("Payment result does not match the invoice.");
			expect(invoice.receipt).toBeNull();
		},
	);

	it("uses the merchant-supplied expected amount rather than trusting the receipt", () => {
		const { invoice, session, result } = sample();
		expect(() => commitPaymentResult(session, session, result, 20000)).toThrow(
			"Payment result does not match the invoice.",
		);
		expect(invoice.receipt).toBeNull();
	});

	it("rejects a decline for another invoice without changing merchant state", () => {
		const { invoice, session } = sample();
		expect(() =>
			commitPaymentResult(
				session,
				session,
				{
					status: "declined",
					invoiceId: "PV-1043",
				},
				17600,
			),
		).toThrow("Invoice mismatch.");
		expect(invoice.receipt).toBeNull();
	});

	it("keeps invoice continuation independent from payment and reset admission", () => {
		const { invoices, invoice, receipt } = sample();
		invoices[1].receipt = { ...receipt, invoiceId: invoices[1].id };
		expect(paymentControls(invoices, invoice, false, false)).toEqual({
			busy: false,
			paid: false,
			nextInvoice: invoices[2],
		});
		expect(paymentControls(invoices, invoice, true, false).busy).toBe(true);
		expect(paymentControls(invoices, invoice, false, true).busy).toBe(true);
		invoice.receipt = receipt;
		invoices[2].receipt = { ...receipt, invoiceId: invoices[2].id };
		expect(paymentControls(invoices, invoice, false, false)).toEqual({
			busy: false,
			paid: true,
			nextInvoice: null,
		});
	});
});

describe("provider simulation rules", () => {
	it("declines only the first configured attempt and approves retries", () => {
		expect(shouldDeclineAttempt("decline", 1)).toBe(true);
		expect(shouldDeclineAttempt("decline", 2)).toBe(false);
		expect(shouldDeclineAttempt("decline", 3)).toBe(false);
		expect(shouldDeclineAttempt("success", 1)).toBe(false);
	});

	it("builds an approval using supplied time, identifier and masked card data", () => {
		const { receipt } = sample();
		expect(
			approvedPaymentResult(
				{ invoiceId: "PV-1042", amountCents: 17600 },
				{
					transactionId: receipt.transactionId,
					paidAt: receipt.paidAt,
					lastFour: receipt.lastFour,
				},
			),
		).toEqual({ status: "approved", receipt });
	});

	it.each(["4242 4242 4242 4242", "4242424242424242"])(
		"normalizes a valid demo number %s",
		(value) => {
			expect(normalizeDemoCardNumber(value)).toBe("4242424242424242");
		},
	);

	it.each(["", "424242424242424", "42424242424242424", "424242424242424x"])(
		"rejects invalid demo digits %s",
		(value) => {
			expect(normalizeDemoCardNumber(value)).toBeNull();
		},
	);

	it("requires the merchant's recorded acknowledgement before closing an approval", () => {
		expect(() =>
			assertPaymentRecorded({ invoiceId: "PV-1042", status: "recorded" }),
		).not.toThrow();
		expect(() =>
			assertPaymentRecorded({ invoiceId: "PV-1042", status: "declined" }),
		).toThrow("The clinic did not record the payment.");
	});
});
