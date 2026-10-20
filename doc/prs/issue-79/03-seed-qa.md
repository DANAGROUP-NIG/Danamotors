# Add Kia Plaza sample seed tools and report QA evidence

Add read-only legacy inspection/export tools, an offline cohort validator, and a dry-run-first transactional development seed with a PowerShell wrapper. Document LAN execution, failed-migration recovery, report walkthrough and mock UI preview evidence. Raw customer exports and credentials are excluded.

Validation: supplied cohort passes schema-field, required-field, deterministic-ID, repeatability and return-bound checks. Plan contains 104 jobs, 99 bookings, 75 stored-total bills and connected parts/labour/estimates; one incomplete booking is skipped. Ten checked source joins match.

Target execution and reconciliation remain pending LAN access. Cash/credit and tax-category mappings are TODOs; historical warranty snapshots, staff/corporate assignments, stock movements and separate return history are not recreated. This is capped sample coverage, not complete-month financial parity.

Stacked on issue-79/frontend; merge backend and UI first. Related to #79; do not close the issue before live acceptance.
