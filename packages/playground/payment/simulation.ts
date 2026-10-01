import type {
	DemoOutcome,
	DemoReceipt,
	PaymentAcknowledgement,
	PaymentProps,
	PaymentResult,
} from "./contract";

/** First valid attempt declines when configured; retries approve in that window. */
export function shouldDeclineAttempt(
	outcome: DemoOutcome,
	attempt: number,
): boolean {
	return outcome === "decline" && attempt === 1;
}

/** Returns normalized demo card digits, or null when exactly 16 digits are absent. */
export function normalizeDemoCardNumber(value: string): string | null {
	const digits = value.replace(/\s/g, "");
	return /^\d{16}$/.test(digits) ? digits : null;
}

/** Clock, ID and masked-card observations supplied by the provider integration. */
export type ReceiptEvidence = Pick<
	DemoReceipt,
	"transactionId" | "paidAt" | "lastFour"
>;

/** Constructs callback data from supplied observations without time or randomness. */
export function approvedPaymentResult(
	invoice: Pick<PaymentProps, "invoiceId" | "amountCents">,
	evidence: ReceiptEvidence,
): Extract<PaymentResult, { status: "approved" }> {
	return {
		status: "approved",
		receipt: {
			invoiceId: invoice.invoiceId,
			amountCents: invoice.amountCents,
			...evidence,
		},
	};
}

/** Rejects an unrecorded approval before the integration marks it paid and closes. */
export function assertPaymentRecorded(
	acknowledgement: PaymentAcknowledgement,
): void {
	if (acknowledgement.status !== "recorded")
		throw new Error("The clinic did not record the payment.");
}
