import type { DemoReceipt } from "../../payment/contract";

export interface Invoice {
	id: string;
	customer: string;
	pet: string;
	petDescription: string;
	visit: string;
	items: { description: string; amountCents: number }[];
	/** Null until a verified result callback commits this invoice's demo receipt. */
	receipt: DemoReceipt | null;
}

/** Returns fresh, entirely fictional examples for each page session or reset. */
export function seedInvoices(): Invoice[] {
	return [
		{
			id: "PV-1042",
			customer: "Alex Morgan",
			pet: "Milo",
			petDescription: "Golden retriever · 4 years",
			visit: "Annual check-up",
			items: [
				{ description: "Veterinary consultation", amountCents: 9500 },
				{ description: "Annual booster vaccination", amountCents: 6500 },
				{ description: "Preventative care supplies", amountCents: 1600 },
			],
			receipt: null,
		},
		{
			id: "PV-1043",
			customer: "Sam Parker",
			pet: "Cleo",
			petDescription: "Domestic shorthair · 8 months",
			visit: "First visit",
			items: [
				{ description: "Microchip and registration", amountCents: 8800 },
				{ description: "Kitten wellness consultation", amountCents: 6600 },
			],
			receipt: null,
		},
		{
			id: "PV-1044",
			customer: "Jordan Lee",
			pet: "Archie",
			petDescription: "Cavoodle · 6 years",
			visit: "Dental care",
			items: [
				{ description: "Dental examination and clean", amountCents: 25300 },
				{ description: "Aftercare medication", amountCents: 3300 },
			],
			receipt: null,
		},
	];
}

/** Sums the fixed line items in integer AUD cents, including the displayed GST. */
export function invoiceTotal(invoice: Invoice): number {
	return invoice.items.reduce((total, item) => total + item.amountCents, 0);
}
