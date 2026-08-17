# Agent notes for csv2brightspace

## Architectural contract

- This is a dependency-free static site for GitHub Pages.
- `index.html` is the complete application and must work when opened directly with a `file://` URL. This rules out ES modules, which are blocked by CORS over `file://`. Do not split the app into separate `.js` files.
- Do not add a framework, build step, server requirement, or external runtime dependency unless explicitly requested.
- Keep all conversion entirely in the browser. Uploaded data must not leave the device. There is no `fetch`, no analytics, no telemetry, and no storage.

## The canonical model is the hinge

Both parsers (`parseFlat`, `parseVertical`) produce the same `Question[]`, and both emitters (`emitFlat`, `emitVertical`) consume it. That is what makes the round-trip provable. Any change that adds a field must touch all four, or the round-trip tests will catch it.

## Format rules that are easy to get wrong

The Brightspace CSV format has no published specification. D2L's sample file *is* the spec, and it is preserved verbatim at `examples/sample-vertical.csv`. These asymmetries are real and load-bearing:

- `Option` weights are **percentages 0 to 100 for MC** but **booleans 1/0 for MS**.
- `TRUE`/`FALSE` rows put feedback in **column C**, while `Option` rows put it in **column E**.
- `Item` rows (ordering) put the item text in **column B**, shifting everything left by one.
- `Match` rows pair by the **choice number in column B**, not by position, and may be listed out of order.
- The `HTML` flag is **positional**: the literal string `HTML` goes in the column immediately after the text it applies to.

## Output encoding

- Vertical CSV (the Brightspace import artifact): CRLF, every row padded to exactly 5 columns, **no BOM**. This matches D2L's own file byte for byte in shape.
- Flat CSV (template, example, spreadsheet round-trip): CRLF **with** a UTF-8 BOM, because these are opened in Excel and Excel misreads BOM-less UTF-8.

## Design

The interface follows the design system of the author's academic site: Newsreader
600 for all display type, IBM Plex Sans for everything functional, one deep violet
(`--accent`, `#46166b`) doing all interactive and emphasis work, hairline 1px
borders instead of shadows, and a full dark palette under `prefers-color-scheme`.
Every color is a custom property. Never hard-code a hex in markup or in a rule;
add or reuse a var, or dark mode silently breaks.

Three semantic colors are additions that a personal site never needed: a danger
red for blocking errors, a green for correct answers in the preview, and the
site's gold reassigned from "under review" to "warning". Keep them semantic. The
violet is not a status color and the gold is not decorative.

Both typefaces are SIL Open Font License 1.1, subset to Latin and embedded as
woff2 data URIs (~87 KB of the file). They are embedded rather than linked from
Google Fonts for three reasons: a `<link>` would fail the contract check above, it
would break the page when opened from `file://`, and it would quietly send every
visitor's IP to a third party while the page claims no data leaves their device.
If a face needs regenerating, subset with `fonttools` and keep the OFL notice.

## Testing

After any change to the converter, open `tests/index.html` in a browser and confirm all assertions pass. The fixtures include D2L's official 7-type sample, which is the only artifact exercising `WR`, `SA`, `M`, and `O`. Three round-trip differences are known and asserted as *expected*, not tolerated silently: `SA` answer-mode collapse, `M` match-row reordering, and `O` per-item HTML flag collapse.

`window.__csv2brightspace` exposes the internals for console testing.

## Prior art

The architecture, UI structure, and validation-message tone are deliberately modeled on Stephen D. Turner's [csv2canvas](https://github.com/stephenturner/csv2canvas), which solves the same problem for Canvas. Keep the resemblance; it is intentional.
