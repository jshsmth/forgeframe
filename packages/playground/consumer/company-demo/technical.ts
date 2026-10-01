import { formatMoney } from "../../payment/contract";
import { element } from "./ui";

/** Display-only observations, never a replacement for the real ForgeFrame channel. */
export interface IntegrationSnapshot {
	consumerOrigin: string;
	providerOrigin: string;
	context: "iframe" | "popup";
	phase:
		| "idle"
		| "opening"
		| "ready"
		| "declined"
		| "approved"
		| "closed"
		| "failed";
	pet: string;
	paid: boolean;
	props: {
		invoiceId: string;
		amountCents: number;
		customer: string;
		outcome: string;
	};
}

type Source =
	| "consumer"
	| "provider"
	| "contract"
	| "acceptance"
	| "simulation";
interface Observations {
	steps: (unknown | undefined)[];
	ready: number;
	results: number;
	lastCallback?: unknown;
}
const observations = new Map<string, Observations>();
let snapshot: IntegrationSnapshot;
let source: Source = "consumer";
let selectedStep = 0;
let sources: Record<Source, string> | undefined;
let loading: Promise<void> | undefined;
let sourceError: string | undefined;
const steps = [
	{
		title: "1. Pip provides invoice props",
		description:
			"The consumer supplies invoice data and callback functions when creating its ForgeFrame instance and requesting render. This observes the application call site, not delivery on the wire. Callback functions travel as remote callable references.",
		source: "consumer",
		needle: "const instance = paymentComponents[context]({",
		lines: 20,
	},
	{
		title: "2. Harbor reports readiness",
		description:
			"Harbor initializes the trusted host channel, reads validated props, mounts its form and awaits onReady(). Pip observes that remote invocation.",
		source: "provider",
		needle: "const host = initHost<PaymentProps>",
		lines: 30,
	},
	{
		title: "3. Harbor reports the result",
		description:
			"The provider awaits onResult(result). The result contains a decline or receipt metadata; full card inputs remain in the provider window.",
		source: "provider",
		needle: "const acknowledgement = await props.onResult(result);",
		lines: 15,
	},
	{
		title: "4. Pip returns an acknowledgement",
		description:
			"Pip validates the result and records an approved receipt before returning its acknowledgement. The data below is the real consumer callback return value, not an observation of its delivery to Harbor.",
		source: "acceptance",
		needle: "const receipt = result.receipt;",
		lines: 30,
	},
	{
		title: "5. The payment window closes",
		description:
			"On approval, Harbor validates that the acknowledgement records the submitted invoice before calling close(). This observation comes from the consumer's destroy event after ForgeFrame cleanup. Cancellation can also close a window without a payment result.",
		source: "provider",
		needle: "assertPaymentRecorded(acknowledgement, result.receipt.invoiceId);",
		lines: 5,
	},
] as const;

function current(): Observations {
	let value = observations.get(snapshot.props.invoiceId);
	if (!value) {
		value = { steps: [], ready: 0, results: 0 };
		observations.set(snapshot.props.invoiceId, value);
	}
	return value;
}

/**
 * Loads actual authored files only when Technical is requested.
 *
 * @remarks
 * Browsers cache failed module imports for this document. A loading failure
 * requires a page refresh; switching views preserves the working payment app.
 */
export function loadTechnicalSources(): Promise<void> {
	if (sources || sourceError) return Promise.resolve();
	if (loading) return loading;
	loading = Promise.all([
		import("./main.ts?raw"),
		import("../../host/payment.ts?raw"),
		import("../../payment/contract.ts?raw"),
		import("./acceptance.ts?raw"),
		import("../../payment/simulation.ts?raw"),
	])
		.then(([consumer, provider, contract, acceptance, simulation]) => {
			sources = {
				consumer: consumer.default,
				provider: provider.default,
				contract: contract.default,
				acceptance: acceptance.default,
				simulation: simulation.default,
			};
			renderSource();
			renderStep();
		})
		.catch(() => {
			sourceError =
				"Source could not load.\nRefresh this page to try again.\nRefreshing resets demo invoices.";
			renderSource();
			renderStep();
		})
		.finally(() => {
			loading = undefined;
		});
	return loading;
}

/** Binds guided steps and source navigation once; switching views keeps observations. */
export function initTechnicalView(): void {
	for (const button of document.querySelectorAll<HTMLButtonElement>(
		"[data-step]",
	))
		button.addEventListener("click", () => {
			selectedStep = Number(button.dataset.step);
			renderStep();
		});
	for (const button of document.querySelectorAll<HTMLButtonElement>(
		"[data-source]",
	))
		button.addEventListener("click", () => {
			const target = button.dataset.source;
			if (
				target === "consumer" ||
				target === "provider" ||
				target === "contract" ||
				target === "acceptance" ||
				target === "simulation"
			) {
				source = target;
				renderSource();
			}
		});
	for (const button of document.querySelectorAll<HTMLButtonElement>(
		"[data-jump]",
	))
		button.addEventListener("click", () => {
			const target = button.dataset.jump;
			source =
				target === "initHost" || target === "onResult"
					? "provider"
					: target === "acknowledgement"
						? "acceptance"
						: "consumer";
			renderSource();
			const needle =
				target === "create"
					? "create<PaymentProps>"
					: target === "initHost"
						? "const host = initHost"
						: target === "onResult"
							? "const acknowledgement = await props.onResult"
							: "const receipt = result.receipt;";
			const pre = element("#technical-code").parentElement;
			if (!pre || !sources) return;
			const line = sources[source]
				.split("\n")
				.findIndex((value) => value.includes(needle));
			pre.scrollTop =
				Math.max(0, line) * Number.parseFloat(getComputedStyle(pre).lineHeight);
			pre.focus({ preventScroll: true });
		});
}

function filename(value: Source): string {
	return {
		consumer: "consumer/company-demo/main.ts",
		provider: "host/payment.ts",
		contract: "payment/contract.ts",
		acceptance: "consumer/company-demo/acceptance.ts",
		simulation: "payment/simulation.ts",
	}[value];
}
function renderSource(): void {
	for (const button of document.querySelectorAll<HTMLButtonElement>(
		"[data-source]",
	))
		button.setAttribute(
			"aria-pressed",
			String(button.dataset.source === source),
		);
	element("#technical-code").textContent =
		sources?.[source] ?? sourceError ?? "Loading application source…";
	element("#source-filename").textContent = filename(source);
}
function renderStep(): void {
	const step = steps[selectedStep];
	const observed = current().steps[selectedStep];
	for (const button of document.querySelectorAll<HTMLButtonElement>(
		"[data-step]",
	))
		button.setAttribute(
			"aria-pressed",
			String(Number(button.dataset.step) === selectedStep),
		);
	for (let index = 0; index < steps.length; index++)
		element(`#step-status-${index}`).textContent =
			current().steps[index] === undefined ? "Not observed" : "Observed";
	element("#step-heading").textContent = step.title;
	element("#step-description").textContent = step.description;
	element("#step-observed").textContent =
		observed === undefined
			? "Not observed for this invoice yet."
			: "Observed in this application.";
	element("#step-data").textContent =
		observed === undefined
			? "Run this payment to see its data here."
			: JSON.stringify(observed, null, 2);
	const lines = sources?.[step.source].split("\n");
	const start = lines?.findIndex((line) => line.includes(step.needle)) ?? -1;
	element("#step-source-label").textContent =
		`${filename(step.source)}${start >= 0 ? ` · line ${start + 1}` : ""}`;
	element("#step-code").textContent =
		lines && start >= 0
			? lines.slice(start, start + step.lines).join("\n")
			: (sourceError ??
				"Open Technical to load the actual application source.");
}

/** Refreshes selected invoice context without serializing callback functions. */
export function updateTechnicalView(next: IntegrationSnapshot): void {
	snapshot = next;
	element("#technical-invoice-name").textContent =
		`${next.props.invoiceId} · ${next.pet} · ${formatMoney(next.props.amountCents)}`;
	element("#technical-invoice-outcome").textContent = next.paid
		? "Payment outcome: Paid · Receipt recorded by Pip"
		: "Payment outcome: Awaiting payment";
	element("#connection-phase").textContent = next.phase;
	element("#consumer-origin").textContent = next.consumerOrigin;
	element("#provider-origin").textContent = next.providerOrigin;
	element("#live-props").textContent = JSON.stringify(
		{
			...next.props,
			onReady: "() => void [remote callback]",
			onResult: "PaymentResult => PaymentAcknowledgement [remote callback]",
		},
		null,
		2,
	);
	element("#connection-context").textContent =
		next.context === "iframe" ? "Modal iframe" : "Popup";
	const observed = current();
	element("#onReady-calls").textContent =
		`${observed.ready} ${observed.ready === 1 ? "call" : "calls"}`;
	element("#onResult-calls").textContent =
		`${observed.results} ${observed.results === 1 ? "call" : "calls"}`;
	element("#callback-payload").textContent = observed.lastCallback
		? JSON.stringify(observed.lastCallback, null, 2)
		: "No callback yet for this invoice.";
	renderStep();
}

/** Records only actual render/destroy call sites, keyed to the captured invoice. */
export function recordWindowStep(step: "opened" | "closed"): void {
	current().steps[step === "opened" ? 0 : 4] =
		step === "opened"
			? {
					...snapshot.props,
					context: snapshot.context,
					providerOrigin: snapshot.providerOrigin,
					callbacks: ["onReady", "onResult"],
				}
			: {
					event: "destroy",
					invoiceId: snapshot.props.invoiceId,
					paymentRecorded: snapshot.paid,
				};
	renderStep();
}

/** Records the real consumer callback invocation and its local return value. */
export function recordCallback(
	name: "onReady" | "onResult",
	args: unknown,
	returned: unknown,
): void {
	const observed = current();
	if (name === "onReady") {
		observed.ready++;
		observed.steps[1] = { callback: name, arguments: args, returned: "void" };
	} else {
		observed.results++;
		observed.steps[2] = args;
		observed.steps[3] = returned;
	}
	observed.lastCallback = {
		callback: name,
		direction: "Harbor Pay → Pip Veterinary",
		arguments: args,
		returned: returned === undefined ? "void" : returned,
	};
	updateTechnicalView(snapshot);
}

/** Selects the receipt's real acknowledgement without starting a new payment. */
export function inspectCallback(): void {
	selectedStep = 3;
	renderStep();
}

/** Clears observations together with the merchant's demo invoice reset. */
export function resetTechnicalView(): void {
	observations.clear();
	selectedStep = 0;
}
