---
version: 1
slug: "packages-playground-consumer-company-demo-main-ts"
primary_target: "packages/playground/consumer/company-demo/main.ts"
related_targets: ["packages/playground/host/payment.ts"]
---

# Company payment demo

Mode: Operate. Scope: consumer /company and provider /payment.html. Preserve the original editor and test lab. The compact invoice portal extends the existing system UI directly.

## Direction contract

THESIS: Show a familiar staff task completed across company boundaries: select an invoice, take payment, return to a paid invoice.

OWN-WORLD: Orange #f68621, deep navy #001e64, light neutral surfaces and self-hosted Open Sans. Pip Veterinary and Harbor Pay are fictional. Navy clinic masthead, orange actions with readable navy text, crisp borders and clear controls. An original little cream puppy supplies character without taking over the work.

STORY: Three seeded AUD invoices provide context. Demo options stay in a compact disclosure above the invoice workspace. Experience is the default clinic journey; Technical guides props → ready → result → acknowledgement → close, with actual per-invoice observations and lazily loaded documented source, preserving the same application state. A collapsed explanation points visitors to Technical.

FIRST VIEWPORT: A thin demo toolbar above a compact navy clinic masthead with an authored navy paw emblem on orange beside the Pip wordmark. Invoice list on the left, selected invoice and orange Take payment action on the right. The original puppy sits beside the care line in the existing warm invoice-list footer, rather than floating in the logo row. Mobile starts with the selected invoice, owner/pet, total and Take payment action; Change invoice reveals other samples, and service detail is secondary. Technical puts selected-invoice context and Try this payment before the five guided steps at stacked widths. The payment window keeps provider, clinic, invoice, total and simulation context visible, starts on Use demo details, and keeps pay/cancel within reach.

FORM: Master/detail invoice portal, maintained directly in code. Signature interaction: an acknowledged cross-origin result updates the invoice, reveals a receipt with Inspect this callback and optional Next unpaid invoice, and closes the payment window. Motion uses one short, reduced-motion-aware receipt reveal.

FINISH: Keep DESIGN.md and shipping raster provenance current when the visual system changes. Verify the result at desktop and mobile widths.

## Quality bar

All controls work; no decorative navigation. Clear sample-data labels without overwhelming the product. Keyboard-operable modal, meaningful status updates, readable tables at small widths, accessible contrast, focused error recovery and no card data in merchant events. The original decorative puppy is shipped as a small WebP with provenance; Open Sans uses a Latin variable WOFF2.
