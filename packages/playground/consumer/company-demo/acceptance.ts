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
 * @param expectedAmountCents - The merchant's independently calculated invoice total.
 * @returns The outcome and acknowledgement for the integration to present and return.
 * @throws If the session ended, a receipt already exists, or invoice/amount do not match.
 * @remarks
 * Approval commits the receipt to the supplied invoice before returning. Decline
 * leaves it unpaid. A production merchant would verify the payment with its backend
 * here; a callback and these demo checks alone are not payment verification.
 */
export function commitPaymentResult(
	active: PaymentSessionState | null,
	session: PaymentSessionState,
	result: PaymentResult,
	expectedAmountCents: number,
): AcceptedPayment {
	if (active !== session || session.cancelled || session.invoice.receipt)
		throw new Error("This payment session has ended.");
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
