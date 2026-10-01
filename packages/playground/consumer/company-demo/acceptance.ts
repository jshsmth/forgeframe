import type {
	DemoReceipt,
	PaymentAcknowledgement,
	PaymentResult,
} from "../../payment/contract";
import type { Invoice } from "./invoices";

/** Merchant-owned state; the ForgeFrame instance remains with the integration. */
export interface PaymentSessionState {
	invoice: Invoice;
	cancelled: boolean;
}

export type AcceptedPayment =
	| { phase: "declined"; acknowledgement: PaymentAcknowledgement }
	| {
			phase: "approved";
			acknowledgement: PaymentAcknowledgement;
			receipt: DemoReceipt;
	  };

/**
 * Applies the merchant's acceptance rules without a browser or transport.
 *
 * @param active - The current session object; identity, not invoice ID, determines ownership.
 * @param payload - Untrusted callback arguments; a function schema validates callability only.
 * @param expectedAmountCents - The merchant's independently calculated invoice total.
 * @returns The outcome and acknowledgement for the integration to present and return.
 * @throws If the session ended, the payload is malformed, a receipt already exists, or invoice/amount do not match.
 * @remarks
 * Approval commits a validated receipt snapshot before returning. Decline
 * leaves it unpaid. A production merchant would verify the payment with its backend
 * here; a callback and these demo checks alone are not payment verification.
 */
export function commitPaymentResult(
	active: PaymentSessionState | null,
	session: PaymentSessionState,
	payload: unknown,
	expectedAmountCents: number,
): AcceptedPayment {
	if (active !== session || session.cancelled || session.invoice.receipt)
		throw new Error("This payment session has ended.");
	const result = readPaymentResult(payload);
	if (result.status === "declined") {
		if (result.invoiceId !== session.invoice.id)
			throw new Error("Invoice mismatch.");
		return {
			phase: "declined",
			acknowledgement: { invoiceId: session.invoice.id, status: "declined" },
		};
	}
	const receipt = result.receipt;
	if (
		receipt.invoiceId !== session.invoice.id ||
		receipt.amountCents !== expectedAmountCents
	)
		throw new Error("Payment result does not match the invoice.");
	session.invoice.receipt = receipt;
	return {
		phase: "approved",
		receipt,
		acknowledgement: { invoiceId: session.invoice.id, status: "recorded" },
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Checks calendar/time validity as well as ISO syntax; Date.parse alone can normalize invalid days. */
function isIsoTimestamp(value: string): boolean {
	const parts =
		/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?(?:Z|[+-]\d{2}:\d{2})$/.exec(
			value,
		);
	if (!parts || !Number.isFinite(Date.parse(value))) return false;
	const local = `${parts[1]}.${(parts[2] ?? "").padEnd(3, "0")}Z`;
	const time = Date.parse(local);
	return Number.isFinite(time) && new Date(time).toISOString() === local;
}

/** Validates remote arguments and copies only receipt fields the merchant can safely store. */
function readPaymentResult(value: unknown): PaymentResult {
	if (!isRecord(value)) throw new Error("Invalid payment result.");
	if (value.status === "declined") {
		if (typeof value.invoiceId !== "string" || !value.invoiceId.trim())
			throw new Error("Invalid payment result.");
		return { status: "declined", invoiceId: value.invoiceId };
	}
	if (value.status !== "approved" || !isRecord(value.receipt))
		throw new Error("Invalid payment result.");
	const { invoiceId, transactionId, amountCents, paidAt, lastFour } =
		value.receipt;
	if (
		typeof invoiceId !== "string" ||
		!invoiceId.trim() ||
		typeof transactionId !== "string" ||
		!transactionId.trim() ||
		typeof amountCents !== "number" ||
		!Number.isSafeInteger(amountCents) ||
		amountCents < 0 ||
		typeof paidAt !== "string" ||
		!isIsoTimestamp(paidAt) ||
		typeof lastFour !== "string" ||
		!/^\d{4}$/.test(lastFour)
	)
		throw new Error("Invalid payment result.");
	return {
		status: "approved",
		receipt: { invoiceId, transactionId, amountCents, paidAt, lastFour },
	};
}

export interface PaymentControls {
	busy: boolean;
	paid: boolean;
	nextInvoice: Invoice | null;
}

/** Selects payment availability and the next unpaid sample from merchant state. */
export function paymentControls(
	invoices: Invoice[],
	selected: Invoice,
	paymentOpen: boolean,
	resetting: boolean,
): PaymentControls {
	return {
		busy: paymentOpen || resetting,
		paid: !!selected.receipt,
		nextInvoice:
			invoices.find((invoice) => invoice !== selected && !invoice.receipt) ??
			null,
	};
}
