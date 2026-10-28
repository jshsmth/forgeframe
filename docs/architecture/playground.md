---
name: architecture/playground
title: Playground
desc: The company payment demo and the diagnostic playground.
tags: []
sources: []
created: 2026-10-01T01:55:30Z
updated: 2026-10-28T00:00:00Z
---

# Playground

## Company demo

The consumer's `/company` route is a fictional Pip Veterinary invoice portal; the host's `/payment.html` entry is the fictional Harbor Pay provider. The shared [payment contract](../../packages/playground/payment/contract.ts) defines invoice data, the simulated outcome, and the remote readiness and result callbacks. Its amount schema requires nonnegative safe-integer AUD cents at consumer admission and at host initialization and updates, even when a custom consumer validates more loosely. The consumer restricts the provider origin; the provider starts with the tag-agnostic `initHost({ props, consumerOrigins })` form and the shared definitions, so its bundle omits the consumer runtime, and reads props from `ready`. A build-time define that only the browser tests set exposes those props on a namespaced test global; production builds drop it.

State is split by application. The consumer owns invoice selection, session identity, payment receipts, and reset. The provider owns card inputs, form validation, a short simulated processing delay, and decline/retry state. Only receipt metadata crosses back to the merchant.

- **Outcomes.** The first declined attempt leaves the invoice unpaid; a retry approves in the same provider window.
- **Merchant acceptance.** Callback arguments are treated as unknown. The merchant validates the discriminator and every receipt field (safe-integer cents, a valid ISO timestamp, four masked digits), matches the invoice and amount, then commits its own snapshot. Malformed results leave the invoice unpaid and allow a valid retry. These rules live in the browser-independent `consumer/company-demo/acceptance.ts`.
- **Provider acknowledgement.** The provider treats callback return values as unknown and requires the matching status and the invoice captured in its submitted result: `declined` before showing decline/retry feedback, or `recorded` before marking approval and closing. A malformed or mismatched acknowledgement leaves the payment window open with recovery guidance. Outcome, card-number, and acknowledgement rules live in `payment/simulation.ts`; the provider passes clock and randomness observations into receipt construction.
- **Cancellation.** Closing marks the session cancelled, and destroy releases the merchant UI after cleanup. Callbacks from cancelled or replaced sessions cannot commit a payment.
- **Focus.** Native dialogs confine modal focus; the provider handles Escape for focused iframe inputs.

Application entry points compose these rules with DOM presentation and ForgeFrame calls.

Experience and Technical are presentation modes of the same consumer application. The Technical panel observes callback call sites and local return values; it opens no separate communication channel. Its five-step guide records the actual render, readiness callback, result, local acknowledgement return, and destroy for each invoice, and separates payment outcome from window lifecycle. Source tabs lazily import the authored consumer, host, shared contract, and both rule modules when Technical is first opened; their TSDoc explains the integration boundaries. A source-loading failure never blocks payment. Browsers cache failed module imports, so the recovery guidance asks for a page refresh and warns that refreshing resets the sample invoices.

Consumer builds generate static entry pages for `/company` and the test routes. Host builds include the payment entry separately from the diagnostic host. `VITE_HOST_URL` sets the provider address; `VITE_CONSUMER_URL` sets the payment host's consumer allowlist. All payment processing and seed data are fictional and reset without persistence.

## Diagnostic playground

Host displays and consumer logs build dynamic content with DOM text properties, keeping peer-controlled strings out of HTML parsing. Static layouts and controls are authored markup.
