import { prop } from "forgeframe";

/** Receipt metadata returned by Harbor Pay; full card inputs stay in the host. */
export interface DemoReceipt {
	invoiceId: string;
	transactionId: string;
	/** Total in nonnegative safe-integer AUD cents, matching the consumer's invoice. */
	amountCents: number;
	/** Valid ISO timestamp with timezone and up to millisecond precision. */
	paidAt: string;
	/** Exactly four decimal digits; never the full card number. */
	lastFour: string;
}

/** `decline` rejects the first valid attempt and approves a retry in that window. */
export type DemoOutcome = "success" | "decline";
export type PaymentResult =
	| { status: "approved"; receipt: DemoReceipt }
	| { status: "declined"; invoiceId: string };

/** Merchant acknowledgement returned across the remote callback bridge. */
export interface PaymentAcknowledgement {
	invoiceId: string;
	status: "recorded" | "declined";
}

/**
 * Application props passed from Pip Veterinary to the Harbor Pay host.
 *
 * @remarks
 * Both applications use {@link paymentProps} to validate props and callback
 * callability. Function schemas do not validate invocation arguments; the
 * merchant validates the complete result before committing a receipt. Local
 * callbacks use their ordinary return types here; `HostProps<PaymentProps>`
 * presents them as asynchronous remote functions. The host awaits the result
 * acknowledgement before closing. No card number, expiry or CVC is delivered
 * to the consumer.
 */
export interface PaymentProps extends Record<string, unknown> {
	invoiceId: string;
	/** Invoice total in integer AUD cents, rather than floating-point dollars. */
	amountCents: number;
	customer: string;
	outcome: DemoOutcome;
	/** Invoked by the host after verified initialization and form mounting. */
	onReady: () => void;
	/**
	 * Reports an attempt to the consumer, which validates and records its result.
	 * A remote rejection leaves the host open with recovery guidance.
	 */
	onResult: (result: PaymentResult) => PaymentAcknowledgement;
}

/** Shared runtime schemas; callbacks travel through ForgeFrame's function bridge. */
export const paymentProps = {
	invoiceId: prop.string(),
	amountCents: prop.number(),
	customer: prop.string(),
	outcome: prop.enum(["success", "decline"]),
	onReady: prop.function<PaymentProps["onReady"]>(),
	onResult: prop.function<PaymentProps["onResult"]>(),
};

/** Formats a supplied cent amount for the AUD invoices and payment form. */
export function formatMoney(cents: number): string {
	return new Intl.NumberFormat("en-AU", {
		style: "currency",
		currency: "AUD",
	}).format(cents / 100);
}
