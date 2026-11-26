# CSI verification evidence, 24 November 2026

These captures use synthetic verification data in an isolated headless Chrome profile against the local Next app. API requests were intercepted. They do not contain business master data or real customer accounts. Database behavior was tested separately against a fresh, disposable localhost PostgreSQL cluster.

| State | Viewport | Evidence |
| --- | --- | --- |
| Generation, filled and disabled controls | 1440 x 1000 | [Desktop generation](./generation-desktop.png) |
| Generation, loading | 1440 x 1000 | [Loading options](./generation-loading.png) |
| Generation, error with retry | 1440 x 1000 | [Retry state](./generation-error.png) |
| Generation, empty | 390 x 844 | [Mobile empty results](./generation-mobile-empty.png) |
| Permission denied | 390 x 844 | [CSI access message](./permission-denied.png) |
| Response form, filled details | 390 x 844 | [Mobile response](./response-mobile.png) |
| Response form, field validation | 390 x 844 | [Inline validation](./response-validation-mobile.png) |
| Response saved | 1440 x 1000 | [Saved score](./response-success-desktop.png) |
| Response list, empty with next action | 390 x 844 | [Empty questionnaires](./responses-mobile-empty.png) |
| CSI report, filled with averages | 1440 x 1000 | [Report summary and averages](./report-desktop.png) |
| Attribute report filters | 390 x 844 | [Mobile report](./attribute-report-mobile.png) |

Additional checks:

- No document-level horizontal overflow in the tested desktop/mobile states. Filled tables retain their own scroll container. Empty-state text now wraps within the viewport.
- Native Tab from the last modal control cycles to the first control, with a visible focus indicator. Clicking the backdrop preserves the response form.
- Missing answers produce field-level validation. The response save and correction states were exercised. Unicode feedback survived the browser save/read-back path.
- Sampled response-form text contrast was 4.76:1. This is a targeted check, not a complete accessibility audit of the surrounding application shell.
- [The 29-question PDF](./questionnaire-compact.pdf) generates successfully in two A4 pages using long synthetic questions, reduced from three pages before print-spacing adjustments. Actual paper output and a manual inspection of every PDF page/glyph remain release checks.
- [The generated Excel workbook](./csi-export.xlsx) was parsed with the existing SheetJS package. Its survey score, percentage and average footer matched the browser's report values. This checks workbook content, not manual review in desktop Excel.
- No application JavaScript exceptions were observed. A canceled, intercepted navigation produced one harness-only interception-id message.

The temporary browser and PostgreSQL processes are stopped after verification. The configured application database was not migrated or seeded. Business approval of the proposed formula, satisfaction bands and role grants, plus the verified legacy master export, remains outstanding.
