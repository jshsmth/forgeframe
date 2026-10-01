# Demo assets

`pip-dog.png` is the original transparent puppy generated with the built-in image-generation tool for Pip Veterinary. Its exact prompt is embedded in PNG metadata and retained in `pip-dog.prompt.txt`. It is decorative, not a real patient portrait. No reference-company assets were used.

The demo ships `pip-dog.webp` (180px wide, 6,190 bytes), a resized WebP export of that same illustration using `cwebp -q 86 -resize 180 0`. The original PNG is preserved for provenance. WebP provenance uses the companion `pip-dog.webp.json` prompt sidecar; `impeccable embed-prompt --scan packages/playground/assets` validates both formats. The below-fold image is lazy loaded and has explicit layout dimensions.

The shared theme ships `open-sans-latin.woff2` (42,964 bytes), the same Open Sans variable family in the Google Fonts Latin web subset, with weights 300–800 and `font-display: swap`. Downloaded on 2026-10-01 from the [Google Fonts distribution](https://fonts.gstatic.com/s/opensans/v44/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS-mu0SC55I.woff2). `open-sans-variable.ttf` is retained as the original source from the [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/opensans); it is not imported by the demo. Its SIL Open Font License is included in `OpenSans-OFL.txt`.

`theme.css` provides shared font, palette and semantic primitives. The user's theme establishes color/font inspiration; layouts, fictional companies, content and illustration are authored for this demo. Keep keyboard focus visible and navy lettering on orange actions.
