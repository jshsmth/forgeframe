import dogImage from "../../assets/pip-dog.webp";
import { formatMoney } from "../../payment/contract";
import { requireValue } from "../../require-value";
import { type Invoice, invoiceTotal } from "./invoices";
import { technicalMarkup } from "./technical-ui";

/**
 * Mounts the merchant shell and its two presentation modes once per page load.
 *
 * @remarks
 * HTML templates contain authored markup and build asset URLs. Invoice, receipt, callback and
 * source-code values are assigned through text properties, never HTML parsing.
 */
export function renderShell(): void {
	document.title = "Pip Veterinary · ForgeFrame company demo";
	document.body.className = "company-demo";
	document.body.innerHTML = `
		<div class="demo-toolbar">
			<a href="/" class="playground-link">Back to playground</a>
			<div class="demo-title"><strong>ForgeFrame payment demo</strong><span class="demo-label">Fictional companies · No money moves</span></div>
			<div class="view-switch" role="group" aria-label="Demo view"><button type="button" id="experience-view" aria-pressed="true">Experience</button><button type="button" id="technical-view" aria-pressed="false">Technical</button></div>
			<button type="button" id="reset-demo" class="quiet-button">Reset demo</button><a href="/tests" class="test-link">Test routes</a>
		</div>
		<div class="demo-layout">
		<div id="clinic-workspace">
			<header class="clinic-header">
				<div class="clinic-brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" width="28" height="28" focusable="false"><ellipse cx="6.5" cy="12" rx="3" ry="4" transform="rotate(-25 6.5 12)"/><ellipse cx="12.5" cy="7.5" rx="3" ry="4" transform="rotate(-8 12.5 7.5)"/><ellipse cx="20" cy="7.5" rx="3" ry="4" transform="rotate(8 20 7.5)"/><ellipse cx="26" cy="12" rx="3" ry="4" transform="rotate(25 26 12)"/><path d="M16 14c-3.4 0-4.5 3.3-7.4 6.1-2.5 2.5-1.8 6.2 1.4 7.1 2.1.6 3.7-.8 6-.8s3.9 1.4 6 .8c3.2-.9 3.9-4.6 1.4-7.1C20.5 17.3 19.4 14 16 14Z"/></svg></span><span>Pip Veterinary</span></div>
				<span class="staff-profile"><span class="staff-avatar" aria-hidden="true">JD</span><span>Jamie Davis<span class="brand-caption">Reception · Demo user</span></span></span>
			</header>
			<main class="clinic-main">
				<div class="workspace-heading"><div><h1>Invoices</h1><p>Take a payment without leaving the clinic.</p></div><span id="invoice-summary" class="invoice-summary"></span></div>
				<details id="demo-settings" class="demo-settings"><summary>Demo options</summary><div class="demo-controls" aria-label="Demo settings">
					<div class="demo-control"><label for="payment-mode">Payment window</label><select id="payment-mode"><option value="iframe">In this page (iframe)</option><option value="popup">Separate window (popup)</option></select></div>
					<div class="demo-control"><label for="payment-outcome">Payment outcome</label><select id="payment-outcome"><option value="success">Approved</option><option value="decline">Decline first attempt</option></select></div>
					<span>Try an approval, or a decline followed by a retry.</span>
				</div></details>
				<p id="demo-notice" class="demo-notice" role="status" hidden></p>
				<div class="invoice-workspace"><details id="invoice-picker" class="invoice-picker"><summary>Change invoice · 3 samples</summary><section class="invoice-sidebar" aria-labelledby="invoice-list-heading"><h2 id="invoice-list-heading">Recent invoices</h2><div id="invoice-list"></div><div class="clinic-care"><img src="${dogImage}" class="clinic-mascot" width="64" height="76" loading="lazy" alt="" aria-hidden="true"><div><p class="care-caption">A little care goes a long way.</p><p class="list-note">Sample clinic activity · AUD</p></div></div></section></details><article id="invoice-detail" class="invoice-detail" aria-label="Selected invoice"></article></div>
				<details class="integration-details"><summary>How this works with ForgeFrame</summary><div class="integration-content"><div><h2>Two apps. One familiar workflow.</h2><p>Pip Veterinary sends invoice details to Harbor Pay on a separate origin. Harbor Pay owns the form and calls back with a simulated result. Pip updates its invoice, then the payment window closes. Card inputs stay in the provider window.</p><p id="origin-description"></p><button type="button" id="explain-technical" class="quiet-button">Open technical view</button></div></div></details>
				<footer class="clinic-footer">Pip Veterinary and Harbor Pay are fictional demo companies.</footer>
			</main>
		</div>
		${technicalMarkup()}
		</div>
		<dialog id="payment-dialog" class="payment-dialog" aria-labelledby="payment-dialog-title"><header class="dialog-header"><span id="payment-dialog-title">Payment with Harbor Pay</span><button type="button" id="close-payment" class="quiet-button">Close payment</button></header><div class="payment-mount" id="payment-mount"><p class="payment-loading">Connecting to Harbor Pay…</p></div></dialog>
		<div id="popup-mount" hidden></div>`;
}

export function element<T extends HTMLElement>(selector: string): T {
	return requireValue(document.querySelector<T>(selector));
}

function text(tag: string, value: string, className?: string): HTMLElement {
	const node = document.createElement(tag);
	node.textContent = value;
	if (className) node.className = className;
	return node;
}

/**
 * Renders the merchant-owned invoice selection and its current payment state.
 *
 * @param busy - Prevents invoice changes while a payment or reset owns the session.
 * @remarks
 * Receipts belong to individual invoice objects. Re-rendering updates the view
 * without constructing or replacing the active ForgeFrame instance.
 */
export function renderInvoices(
	invoices: Invoice[],
	selected: Invoice,
	busy: boolean,
	select: (invoice: Invoice) => void,
	pay: () => void,
	inspect: () => void,
	next: (() => void) | null,
): void {
	element("#invoice-summary").textContent =
		`${invoices.filter((invoice) => !invoice.receipt).length} awaiting payment`;
	const list = document.createDocumentFragment();
	for (const invoice of invoices) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "invoice-choice";
		button.setAttribute("aria-pressed", String(invoice === selected));
		button.disabled = busy;
		button.setAttribute(
			"aria-label",
			`${invoice.id} · ${invoice.pet} · ${invoice.customer} · ${formatMoney(invoiceTotal(invoice))} · ${invoice.receipt ? "Paid" : "Awaiting payment"}`,
		);
		const title = text("span", invoice.pet, "invoice-pet");
		title.append(
			text("span", formatMoney(invoiceTotal(invoice)), "invoice-amount"),
		);
		const status = text(
			"span",
			invoice.receipt ? "Paid" : "Awaiting payment",
			invoice.receipt ? "invoice-status paid" : "invoice-status",
		);
		button.append(
			title,
			text("span", `${invoice.customer} · ${invoice.id}`, "invoice-customer"),
			status,
		);
		button.addEventListener("click", () => select(invoice));
		list.append(button);
	}
	element("#invoice-list").replaceChildren(list);
	const detail = element("#invoice-detail");
	detail.innerHTML = `<header class="invoice-detail-header"><div><h2 id="invoice-title" tabindex="-1"></h2><p id="invoice-visit"></p></div><span id="invoice-status" class="invoice-status"></span></header><dl class="invoice-parties"><div><dt>Bill to</dt><dd id="customer-name"></dd></div><div><dt>Patient</dt><dd><span id="pet-name"></span><span id="pet-description"></span></dd></div></dl><div class="invoice-payment-summary"><div class="invoice-total"><span>Total <small>AUD · Includes GST</small></span><strong id="invoice-total"></strong></div><div id="invoice-action"></div></div><details class="invoice-services"><summary>Services provided <span>${selected.items.length} items</span></summary><table class="invoice-items"><caption>Itemised services</caption><thead><tr><th scope="col">Description</th><th scope="col">Amount</th></tr></thead><tbody id="invoice-items"></tbody></table></details>`;
	element<HTMLDetailsElement>(".invoice-services").open =
		matchMedia("(min-width: 651px)").matches;
	element("#invoice-title").textContent = `Invoice ${selected.id}`;
	element("#invoice-visit").textContent = selected.visit;
	element("#invoice-status").textContent = selected.receipt
		? "Paid"
		: "Awaiting payment";
	element("#invoice-status").classList.toggle("paid", !!selected.receipt);
	element("#customer-name").textContent = selected.customer;
	element("#pet-name").textContent = selected.pet;
	element("#pet-description").textContent = selected.petDescription;
	for (const item of selected.items) {
		const row = document.createElement("tr");
		row.append(
			text("td", item.description),
			text("td", formatMoney(item.amountCents)),
		);
		element("#invoice-items").append(row);
	}
	element("#invoice-total").textContent = formatMoney(invoiceTotal(selected));
	const action = element("#invoice-action");
	if (selected.receipt) {
		const receipt = selected.receipt;
		action.className = "payment-receipt";
		action.append(
			text("h3", "Payment received"),
			text("p", `Harbor Pay · Demo card ending ${receipt.lastFour}`),
		);
		const metadata = document.createElement("dl");
		const paidAt = new Intl.DateTimeFormat("en-AU", {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(receipt.paidAt));
		for (const [label, value] of [
			["Receipt", receipt.transactionId],
			["Paid", paidAt],
		]) {
			const row = document.createElement("div");
			row.append(text("dt", label), text("dd", value));
			metadata.append(row);
		}
		action.append(metadata);
		const inspectButton = text(
			"button",
			"Inspect this callback",
			"quiet-button",
		) as HTMLButtonElement;
		inspectButton.type = "button";
		inspectButton.addEventListener("click", inspect);
		action.append(inspectButton);
		if (next) {
			const nextButton = text(
				"button",
				"Next unpaid invoice",
				"quiet-button",
			) as HTMLButtonElement;
			nextButton.type = "button";
			nextButton.addEventListener("click", next);
			action.append(nextButton);
		}
	} else {
		action.className = "invoice-payment-action";
		const button = document.createElement("button");
		button.id = "take-payment";
		button.type = "button";
		button.className = "primary-button";
		button.disabled = busy;
		button.textContent = busy ? "Payment window open…" : "Take payment";
		button.addEventListener("click", pay);
		action.append(
			button,
			text("p", "Payment provided by Harbor Pay. Demo transactions only."),
		);
	}
}

export function showNotice(message: string): void {
	const notice = element("#demo-notice");
	notice.textContent = message;
	notice.hidden = !message;
}
