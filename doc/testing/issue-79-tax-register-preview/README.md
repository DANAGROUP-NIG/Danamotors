# Tax register preview evidence

Rendered from the actual ReportOutput component with two synthetic bills; this is layout/export evidence, not customer data or an authenticated end-to-end test.

- desktop.png: 1440px viewport, grouped headings and numeric alignment; the wide grid scrolls internally.
- mobile.png: Chrome device emulation at 390px. Both innerWidth and document scrollWidth verified as 390; remaining columns scroll within the table.
- print.png: print-media layout with all 24 columns.
- print.pdf: actual browser print, one landscape A4 page (approximately 842 by 595 points).
- Job-card-tax-register.xlsx: captured through the actual Excel action. Verified merged column-group headings, WCT and Net total; separate grand-total sheet uses monetary columns only. It includes report/branch/date metadata.

Live database aggregate evidence is separate in ../issue-79-tax-register-verification.json. The live register uses the same column metadata and stored snapshots. Legacy cash/credit flag meanings remain pending, so imported bills are explicitly unclassified.
