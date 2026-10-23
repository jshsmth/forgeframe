# Demo assets

`pip-dog.png` is the original transparent puppy illustration for Pip Veterinary, made with an image-generation tool. Its prompt is embedded in the PNG metadata and kept in `pip-dog.prompt.txt`. It is decorative, not a real patient, and uses no assets from real companies.

The demo ships `pip-dog.webp` (180px wide, 6,190 bytes), exported from the PNG with `cwebp -q 86 -resize 180 0`; the PNG is kept for provenance. The WebP's prompt lives in the `pip-dog.webp.json` sidecar, and `impeccable embed-prompt --scan packages/playground/assets` validates both formats. The image is below the fold, lazy loaded, and has explicit layout dimensions.

`open-sans-latin.woff2` (42,964 bytes) is the Open Sans variable font, Google Fonts Latin subset, weights 300–800, used with `font-display: swap`. It was downloaded on 2026-10-01 from the [Google Fonts distribution](https://fonts.gstatic.com/s/opensans/v44/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS-mu0SC55I.woff2). `open-sans-variable.ttf` is the original source from the [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/opensans) and is not imported by the demo. The SIL Open Font License is in `OpenSans-OFL.txt`.

`theme.css` defines the shared font, palette, and semantic tokens. Layouts, company names, content, and illustration are original to this demo. Keep keyboard focus visible and use navy text on orange actions.
