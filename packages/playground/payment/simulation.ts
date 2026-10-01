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

/**
 * Validates an untrusted callback return before presenting its matching outcome.
 *
 * @param expectedInvoiceId - The invoice in the submitted result, captured before awaiting the callback.
 * @param expectedStatus - The acknowledgement required for the reported approval or decline.
 * @throws If the merchant did not acknowledge that outcome for the submitted invoice.
 * @remarks Function schemas validate callability, not callback return payloads.
 */
export function assertPaymentAcknowledged(
	acknowledgement: unknown,
	expectedInvoiceId: string,
	expectedStatus: PaymentAcknowledgement["status"],
): void {
	if (
		typeof acknowledgement !== "object" ||
		acknowledgement === null ||
		Array.isArray(acknowledgement) ||
		!("status" in acknowledgement) ||
		acknowledgement.status !== expectedStatus ||
		!("invoiceId" in acknowledgement) ||
		acknowledgement.invoiceId !== expectedInvoiceId
	)
		throw new Error(
			expectedStatus === "recorded"
				? "The clinic did not record the payment."
				: "The clinic did not acknowledge the decline.",
		);
}
