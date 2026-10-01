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
	assertPaymentAcknowledged,
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
		expect(invoice.receipt).toEqual(receipt);
		expect(invoice.receipt).not.toBe(receipt);
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

	it.each([
		null,
		undefined,
		false,
		42,
		"approved",
		[],
		{},
		{ status: "pending" },
		{ status: "declined" },
		{ status: "declined", invoiceId: 1042 },
		{ status: "declined", invoiceId: " " },
		{ status: "approved" },
		{ status: "approved", receipt: null },
		{ status: "approved", receipt: [] },
	])(
		"rejects malformed callback data %# before committing and permits retry",
		(payload) => {
			const { invoice, session, result } = sample();
			expect(() =>
				commitPaymentResult(session, session, payload, 17600),
			).toThrow("Invalid payment result.");
			expect(invoice.receipt).toBeNull();
			expect(commitPaymentResult(session, session, result, 17600).phase).toBe(
				"approved",
			);
		},
	);

	it.each([
		{ invoiceId: undefined },
		{ invoiceId: 1042 },
		{ invoiceId: " " },
		{ transactionId: undefined },
		{ transactionId: 123 },
		{ transactionId: "" },
		{ transactionId: " " },
		{ amountCents: undefined },
		{ amountCents: "17600" },
		{ amountCents: Number.NaN },
		{ amountCents: Number.POSITIVE_INFINITY },
		{ amountCents: -1 },
		{ amountCents: 17600.5 },
		{ amountCents: Number.MAX_SAFE_INTEGER + 1 },
		{ paidAt: undefined },
		{ paidAt: 123 },
		{ paidAt: "" },
		{ paidAt: "not-a-date" },
		{ paidAt: "2026-10-01" },
		{ paidAt: "2026-02-30T07:00:00Z" },
		{ paidAt: "2026-02-29T07:00:00Z" },
		{ paidAt: "2026-02-30T17:00:00+10:00" },
		{ paidAt: "2026-13-01T07:00:00Z" },
		{ paidAt: "2026-10-01T24:00:00Z" },
		{ paidAt: "2026-10-01T07:00:00+25:00" },
		{ lastFour: undefined },
		{ lastFour: 4242 },
		{ lastFour: "" },
		{ lastFour: "424" },
		{ lastFour: "42424" },
		{ lastFour: "42a2" },
	])(
		"rejects malformed receipt fields %# without poisoning invoice state",
		(fields) => {
			const { invoice, session, receipt, result } = sample();
			expect(() =>
				commitPaymentResult(
					session,
					session,
					{
						status: "approved",
						receipt: { ...receipt, ...fields },
					},
					17600,
				),
			).toThrow("Invalid payment result.");
			expect(invoice.receipt).toBeNull();
			expect(commitPaymentResult(session, session, result, 17600).phase).toBe(
				"approved",
			);
		},
	);

	it("rejects an unknown status even when its receipt otherwise matches", () => {
		const { invoice, session, receipt } = sample();
		expect(() =>
			commitPaymentResult(
				session,
				session,
				{
					status: "pending",
					receipt,
				},
				17600,
			),
		).toThrow("Invalid payment result.");
		expect(invoice.receipt).toBeNull();
	});

	it.each([
		"2026-10-01T07:00:00Z",
		"2026-10-01T07:00:00.123Z",
		"2026-10-01T07:00:00.1Z",
		"2026-10-01T17:00:00+10:00",
		"2024-02-29T07:00:00Z",
	])("accepts a valid ISO timestamp %s", (paidAt) => {
		const { session, receipt } = sample();
		const accepted = commitPaymentResult(
			session,
			session,
			{
				status: "approved",
				receipt: { ...receipt, paidAt },
			},
			17600,
		);
		expect(accepted.phase).toBe("approved");
		expect(() =>
			new Intl.DateTimeFormat("en-AU").format(new Date(paidAt)),
		).not.toThrow();
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
		const committed = invoice.receipt;
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
		expect(invoice.receipt).toBe(committed);
	});

	it("owns the validated receipt snapshot independently of callback input", () => {
		const { invoice, session, result, receipt } = sample();
		commitPaymentResult(session, session, result, 17600);
		receipt.paidAt = "not-a-date";
		receipt.amountCents = 1;
		expect(invoice.receipt).toMatchObject({
			paidAt: "2026-10-01T07:00:00Z",
			amountCents: 17600,
		});
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

	it("requires a recorded acknowledgement for the expected invoice", () => {
		expect(() =>
			assertPaymentAcknowledged(
				{ invoiceId: "PV-1042", status: "recorded" },
				"PV-1042",
				"recorded",
			),
		).not.toThrow();
	});

	it.each([
		["another invoice", { invoiceId: "PV-1043", status: "recorded" }],
		["declined", { invoiceId: "PV-1042", status: "declined" }],
		["unknown status", { invoiceId: "PV-1042", status: "approved" }],
		["missing status", { invoiceId: "PV-1042" }],
		["missing invoice", { status: "recorded" }],
		["wrong invoice type", { invoiceId: 1042, status: "recorded" }],
		["blank invoice", { invoiceId: "", status: "recorded" }],
		["null", null],
		["undefined", undefined],
		["array", []],
		["string", "recorded"],
		["boolean", true],
	])(
		"rejects %s acknowledgements before approval",
		(_name, acknowledgement) => {
			expect(() =>
				assertPaymentAcknowledged(acknowledgement, "PV-1042", "recorded"),
			).toThrow("The clinic did not record the payment.");
		},
	);
	it("requires a declined acknowledgement for the submitted invoice", () => {
		expect(() =>
			assertPaymentAcknowledged(
				{ invoiceId: "PV-1042", status: "declined" },
				"PV-1042",
				"declined",
			),
		).not.toThrow();
	});

	it.each([
		["another invoice", { invoiceId: "PV-1043", status: "declined" }],
		["recorded", { invoiceId: "PV-1042", status: "recorded" }],
		["unknown status", { invoiceId: "PV-1042", status: "approved" }],
		["missing status", { invoiceId: "PV-1042" }],
		["missing invoice", { status: "declined" }],
		["wrong invoice type", { invoiceId: 1042, status: "declined" }],
		["blank invoice", { invoiceId: "", status: "declined" }],
		["null", null],
		["undefined", undefined],
		["array", []],
		["string", "declined"],
		["boolean", true],
	])(
		"rejects %s acknowledgements before decline feedback",
		(_name, acknowledgement) => {
			expect(() =>
				assertPaymentAcknowledged(acknowledgement, "PV-1042", "declined"),
			).toThrow("The clinic did not acknowledge the decline.");
		},
	);
});
