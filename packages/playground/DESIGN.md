---
name: "ForgeFrame Playground"
description: "Pip Veterinary and Harbor Pay demo theme, alongside the existing diagnostic playground."
colors:
  demo-navy: "#001e64"
  demo-orange: "#f68621"
  action-hover: "#e0751c"
  surface: "#f7f7fa"
  white: "#fff"
  muted: "#616161"
  line: "#d9d9e1"
  field-line: "#9c9caf"
  focus: "#144aa2"
  warm-surface: "#fff7ed"
  blue-tint: "#eef4ff"
  quiet-surface: "#f2f2f5"
  quiet-ink: "#4d4d4d"
  masthead-caption: "#d9e3ff"
  awaiting-bg: "#fdf5e9"
  awaiting-ink: "#795015"
  paid-bg: "#e8fad7"
  paid-ink: "#386f00"
  selection: "#f9b971"
  scrollbar: "#9b9bb4"
  diagnostic-accent: "#c52d49"
  diagnostic-ink: "#333"
  diagnostic-muted: "#666"
  diagnostic-surface: "#f5f5f5"
  diagnostic-line: "#e0e0e0"
typography:
  headline:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "30px"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  headline-mobile:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "27px"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-0.02em"
  section:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.5
  provider-total:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "26px"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  invoice-total:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.5
  control:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
  input:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  source:
    fontFamily: "ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.65
  title-mobile:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-0.02em"
  brand:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.5
  brand-mobile:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.5
  provider-title:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-0.02em"
  provider-title-compact:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-0.02em"
  provider-total-compact:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  supporting:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  supporting-control:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.5
  small:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
  subheading:
    fontFamily: "Open Sans, system-ui, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.5
  source-small:
    fontFamily: "ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
  source-mobile:
    fontFamily: "ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.65
  diagnostic-body:
    fontFamily: "system-ui, -apple-system, sans-serif"
rounded:
  tag: "4px"
  source-tab: "5px"
  control: "6px"
  view-switch: "7px"
  inset: "8px"
  clinic-mark: "12px"
  surface: "14px"
spacing:
  "4": "4px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "20": "20px"
  "24": "24px"
  "28": "28px"
components:
  button-primary:
    backgroundColor: "{colors.demo-orange}"
    textColor: "{colors.demo-navy}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "12px 22px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-provider:
    backgroundColor: "{colors.demo-orange}"
    textColor: "{colors.demo-navy}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    width: "100%"
  button-quiet:
    backgroundColor: "{colors.white}"
    textColor: "{colors.demo-navy}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-provider-text:
    backgroundColor: "{colors.blue-tint}"
    textColor: "{colors.demo-navy}"
    typography: "{typography.supporting-control}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    width: "100%"
  input-provider:
    backgroundColor: "{colors.white}"
    textColor: "{colors.demo-navy}"
    typography: "{typography.input}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "46px"
    width: "100%"
  view-switch:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.view-switch}"
    padding: "3px"
  status-awaiting:
    backgroundColor: "{colors.awaiting-bg}"
    textColor: "{colors.awaiting-ink}"
    rounded: "{rounded.tag}"
    padding: "3px 8px"
  status-paid:
    backgroundColor: "{colors.paid-bg}"
    textColor: "{colors.paid-ink}"
    rounded: "{rounded.tag}"
    padding: "3px 8px"
  invoice-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.demo-navy}"
    rounded: "{rounded.surface}"
    padding: "24px 28px"
  invoice-choice-selected:
    backgroundColor: "{colors.warm-surface}"
    textColor: "{colors.demo-navy}"
    padding: "16px 18px"
  source-tab-selected:
    backgroundColor: "{colors.demo-navy}"
    textColor: "{colors.white}"
    rounded: "{rounded.source-tab}"
    padding: "8px 12px"
  clinic-emblem:
    backgroundColor: "{colors.demo-orange}"
    textColor: "{colors.demo-navy}"
    rounded: "{rounded.clinic-mark}"
    width: "42px"
    height: "42px"
  select-demo:
    backgroundColor: "{colors.white}"
    textColor: "{colors.demo-navy}"
    rounded: "{rounded.control}"
    padding: "8px 40px 8px 12px"
---

# Design System: ForgeFrame Playground

## Overview

**Creative North Star: "Pip Veterinary and Harbor Pay"**

The company demo uses the user-pinned navy and orange palette, self-hosted Open Sans and clear native controls. Pip Veterinary uses a crisp paw emblem beside its wordmark, with a small original puppy in the invoice-list care footer; Harbor Pay retains its own name and mark within the shared theme. Pale work areas and white invoice surfaces keep the staff task easy to scan.

This documents the company-demo visual system. The original configuration editor and test lab retain their system typography, rose accent and diagnostic status colors. Neither fictional company defines the ForgeFrame library brand.

**Key Characteristics:**

- Navy hierarchy with orange actions and selection.
- Compact, bordered surfaces and familiar controls.
- Crisp paw identity and a small decorative puppy in the care footer.
- Readable stacked layouts with purposeful focus and scrolling.

## Colors

The demo pairs deep navy with bright orange, supported by cool light neutrals. The frontmatter records literal source values; [theme.css](assets/theme.css) supplies the shared font and semantic palette primitives to the merchant, inspector and provider.

### Primary

- **Demo navy:** clinic masthead, primary text, provider mark and selected view/source tabs. Orange actions use navy lettering.
- **Demo orange:** clinic paw tile, primary payment actions and selected invoice edge; the deeper action variant is hover-only.

### Secondary

- **Paid green:** semantic paid labels and receipt surfaces, always accompanied by text.
- **Awaiting amber:** pending labels and provider decline/recovery feedback, distinct from the primary orange action.

### Neutral

- **Surface / white / line:** page ground, invoice and provider surfaces, structural boundaries.
- **Muted / quiet ink:** helper copy, metadata, placeholders and unselected view labels.
- **Warm surface:** selected invoice fill, selected teaching step and invoice-list care footer.
- **Blue tint:** notices, selected-invoice teaching context and the provider demo-fill shortcut/badge; also source text on navy.
- **Quiet surface:** quiet-control hover fills and technical JSON blocks.
- **Masthead caption:** secondary staff text on navy.
- **Focus / selection / scrollbar:** keyboard outline, browser text selection and native scroll affordances.
- **Diagnostic tokens:** the original editor's rose accent and gray surfaces/text. Its green/red runtime statuses remain diagnostic styles in `consumer/index.html`.

**The Scope Rule.** Apply demo tokens to the company and payment routes; preserve the original editor and test lab’s identity.

## Typography

Open Sans is self-hosted as a Latin variable WOFF2 with weights 300–800 and `font-display: swap`. The frontmatter records the actual family stacks, sizes, weights, line heights and tracking. Source/data use `ui-monospace, monospace`; the original diagnostic UI uses system typography.

### Hierarchy

- **Headline:** the Invoices workspace title; its mobile counterpart reduces the size while retaining weight and tracking.
- **Title:** selected invoice heading, with a smaller mobile counterpart. Provider headings use the separate, more compact provider-title roles.
- **Brand:** clinic wordmark, with a mobile counterpart; the provider mark uses the same size with its own weight.
- **Section / subheading:** inspector and provider identity headings, receipt heading and explanatory subheads. The frontmatter distinguishes the regular section weight from bold subheads.
- **Invoice / provider total:** prominently aligned tabular monetary values; the provider total reduces again at its narrow breakpoint. The obsolete larger provider total is not retained.
- **Body / control / input:** compact body copy and primary actions; provider inputs keep the larger input role for legibility.
- **Supporting / supporting control:** workspace explanation, invoice visit, services and teaching introduction; disclosures, selects and demo-fill controls use this size with their actual weight variants.
- **Label / small:** field labels, metadata and outcome badges; simulation disclosures, timestamps, filenames and footnotes use the small role. Small text carries context, never the main payment action.
- **Source / source small / source mobile:** authored code and structured data; filenames use the small role with line-height 1.5, while narrow-screen code keeps source line-height 1.65.

Amounts use tabular numerals; table amounts align right. Descriptive integration copy is bounded to 70ch and payment helper copy to 32ch on wide screens. The recorded roles describe existing uses rather than promoting every local weight to a separate token.

## Layout

Experience uses a compact navy masthead with 18px vertical padding, a 42px paw tile and a non-interactive wordmark. Its main container is capped at 1236px including 28px side gutters, leaving an 1180px content area. The invoice workspace pairs a 270px list with a flexible selected invoice and a 24px gap; invoice detail padding is 24px 28px. At 900px and below, the list becomes 240px, the gap becomes 16px, side gutters become 20px and detail padding becomes 20px. The action and helper copy stack.

At 650px and below, Experience uses 16px side gutters and an 8px main top inset. Change invoice and Demo options share a compact disclosure row; opening Demo options expands it across the grid and moves the invoice picker below. The picker is collapsed initially; the selected invoice, owner/pet, total and full-width payment action lead the task. Services are a secondary disclosure, initially collapsed. Billing parties remain two columns. The detail uses 16px padding, a smaller title and compact vertical spacing. The toolbar wraps into two rows and the view switch expands in its row. The masthead has an 8px vertical inset, the wordmark uses its mobile role, and staff text recedes.

Technical adds a 480px inspector beside the clinic in a maximum 1680px container. The clinic list becomes 220px, its gap 16px, its main padding 24px and its detail padding 20px. At 1250px and below the inspector stacks **first**, above the clinic; selected-invoice context and Try this payment precede the five observation steps. The clinic list returns to 270px until the mobile breakpoint. At 650px and below, inspector padding is 20px 16px, clinic main padding is 16px, detail padding is 18px, and the clinic masthead uses 12px vertical padding. The shared disclosure arrangement still applies.

Source regions scroll locally: JSON is capped at 260px, event history at 220px, complete source at 380px and step excerpts at 240px. Source tabs and jump controls wrap. Each code region is keyboard focusable; source jumps scroll the actual code and focus its region. Invoice selection restores focus to its heading and scrolls it into view at mobile widths. Entering Technical at stacked widths focuses and reveals Integration workspace; Back to invoice returns to the selected heading. Those headings use a 24px top scroll margin. View changes preserve the running application and observations.

The native payment dialog is bounded to `min(480px, calc(100vw - 24px))` wide and `min(760px, calc(100dvh - 24px))` tall. The merchant header stays outside the provider iframe. The provider uses a 480px maximum width with 24px side gutters; at 380px and below gutters become 18px. Provider/clinic/invoice/amount/simulation context sticks at the top; pay/cancel actions stick at the bottom. The provider document scrolls naturally in both iframe and popup, with input scroll margins of 175px above and 115px below and feedback margin of 175px above. The first focused control is Use demo details, after the host show/focus sequence.

## Elevation & Depth

Borders and tonal fills separate ordinary surfaces; invoice cards and selected view buttons have no drop shadow. Selection uses a solid navy view/source tab, a warm teaching-step fill with orange border, or a warm fill on the invoice row. These cues describe state rather than physical elevation.

### Shadow Vocabulary

- **Payment dialog** (`0 24px 80px rgb(0 20 70 / 0.25)`): the sole elevated surface, over a navy backdrop (`rgb(0 16 55 / 0.56)`).

## Shapes

Controls use gently curved corners, status tags use the tighter tag radius, and inset notices/receipts/source regions use the inset radius. Invoice cards and the native dialog share the surface radius. The orange clinic tile is slightly rounder than controls; the staff avatar is circular. Crisp one-pixel borders and table dividers carry structure. The authored paw keeps four distinct toe pads and one central pad.

## Components

### Buttons

Orange merchant/provider actions use navy type and weight 600. Merchant actions use 12px 22px padding and a 46px minimum height; provider actions use 10px 16px and the same minimum height. Quiet buttons are white with a line-colored border and 8px 12px padding. Use demo details is now a full-width, blue-tinted bordered button with 13px type, weight 600 and 8px 12px padding. Provider Cancel remains beside Pay as a quiet bordered action.

Secondary buttons, disclosures, selects, source tabs/jumps and the toolbar links provide at least 44px hit height; teaching steps provide 48px. Compact label type does not shrink the hit area. Merchant disabled controls have opacity 0.6; provider buttons use 0.7. The shared primary hover color deepens orange; quiet controls use quiet-surface hover fill.

Keyboard focus uses a 3px focus-colored outline with 3px offset. Invoice rows inset the outline by 4px. Preserve native modal focus behavior and programmatic heading/source-region focus.

### Status badges and notices

Awaiting and paid badges pair semantic fill with explicit text, 3px 8px padding, 12px type and weight 500. Provider Demo uses the blue tint and small type. Merchant notices remain navy on blue tint with `role="status"`; provider feedback uses awaiting amber and receives focus on decline or acknowledgement failure.

### Invoice surfaces and selection

Invoice list/detail are white, line-bordered surfaces. List buttons show pet, right-aligned amount, customer/invoice metadata and explicit status. Selection uses a warm fill and `aria-pressed`. Busy sessions disable invoice changes. A paid invoice displays merchant-owned receipt metadata and continuation controls: Inspect this callback opens the actual acknowledgement in Technical; Next unpaid invoice appears only while another unpaid sample remains.

### Fields

Provider inputs use a field-line border, white fill, control corners and 10px 12px padding in a fixed 46px height. Placeholders use muted text; labels use 12px type at weight 600. Required/pattern validation and the card-number message use native validation. Processing makes fields read-only with a surface fill, disables Submit and Use demo details, and changes the payment label. Decline focuses recovery feedback and restores editing; approval waits for merchant acknowledgement before closing.

Demo settings retain native selects with white fill, a field-line border, control corners and 13px type. Padding of 8px 40px 8px 12px reserves room for a navy 16px chevron, 12px from the right edge. The authored SVG uses a 1.75px stroke with rounded caps/joins. Suppress browser appearance only for the closed control; keep native options, keyboard selection, focus and disabled behavior. Forced-color mode restores native appearance and removes the chevron image.

### Navigation and technical source

Experience/Technical changes presentation within one running application using `aria-pressed`. Unselected labels use quiet ink on the surface fill; the selected button uses navy and white with no shadow. The five actual steps expose props, readiness, result, acknowledgement and close, with observations retained per invoice. Acknowledgement evidence is explicitly the application's local callback return, not a wire capture. Full props, callbacks, event history, connection details and complete source remain secondary disclosures.

Source tabs use surface/navy unselected treatment and navy/white selected treatment. On Technical entry, lazy imports load actual consumer, provider, shared-contract, merchant-rule and demo-processor files, including TSDoc. Code appears through text properties; source jump controls navigate those files. The clinic wordmark is a `div`, not navigation. The only toolbar anchors return to the existing playground or test routes.

### Payment dialog and receipt

The native modal makes the clinic workspace inert, retains the merchant Close payment control outside the iframe, and routes Escape through cancellation. Closing restores focus to Take payment or the invoice heading. Card fields stay provider-owned; only receipt metadata returns to the merchant.

Receipt reveal is the sole authored animation: 220ms with `cubic-bezier(0.16, 1, 0.3, 1)`, from 4px below at opacity 0.6 to rest. `prefers-reduced-motion: reduce` removes it. Other control state changes have no authored animation.

### Identity and imagery

The clinic masthead pairs an authored filled navy paw SVG with the white Pip wordmark. The paw renders at 28px inside the 42px orange tile. The wordmark supplies the name; the emblem is decorative. Harbor uses a white H on a navy inset-radius tile.

The original transparent puppy sits beside the care line and sample-activity disclosure in the warm list footer. The compact row uses 12px 16px padding and a 12px gap, with a 48×56px `object-fit: contain` image. Care copy uses 13px type at weight 600; disclosure uses 11px muted type with a 6px top margin. The puppy has empty alt text and is lazy loaded with explicit layout dimensions. The shipping raster is the 6,190-byte WebP; the 42,964-byte Latin variable WOFF2 supplies the font. The original PNG/TTF remain for provenance without being imported. [Asset provenance](assets/README.md) records prompt sidecars, generation, conversion and licensing. These byte counts describe assets, not measured loading speed.

## Do's and Don'ts

### Do:

- Do use navy lettering on orange primary actions.
- Do retain readable labels, amount alignment and text alongside semantic status colors.
- Do preserve native form validation, visible focus and state continuity between presentation modes.
- Do keep the puppy compact and decorative in the care footer, using its recorded asset and prompt.
- Do retain the diagnostic playground’s separate palette and system typography.
- Do preserve at least 44px hit heights for compact controls and toolbar links.
- Do keep provider context and actions reachable through natural scrolling and focus margins.

### Don't:

- Don't treat the demo theme as the library's global brand.
- Don't substitute reference-company names, logos or imagery for the fictional demo identities.
- Don't add ornamental navigation or animated backgrounds to the invoice task.
- Don't make Technical navigation reset invoice, session or callback state.
- Don't present local application observations as wire-protocol capture.
