# UI preview evidence

Captured in headless Chrome using the actual monthly report component with mocked delivery-grid data. These artifacts verify UI layout/export formatting, not database correctness or a deployed site.

- desktop.png: 1440×1080 rendering.
- mobile.png: emulated 390px viewport; document width verified as 390px. Filters/buttons fit; table scrolls internally.
- print.png: print-media rendering, with company/branch header and filters.
- delivery-print.pdf: one A4 portrait page, media box approximately 595×842 points.
- Deliveries-by-model.xlsx: actual export Blob captured from the Excel action. ZIP/XML verified: header, three date rows, totals row (Rio 3, Sportage 1, total 4). Browser file saving was blocked in this sandbox, so the produced Blob was captured through DevTools and written locally. Dates and grand totals follow the screen data.

The temporary mock preview route was removed after capture. Use the QA fixture and full walkthrough to verify live API behavior.
