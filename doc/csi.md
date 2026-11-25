# Customer satisfaction index

CSI masters are available under Workshop, CSI masters. Each workshop branch maintains its own attributes, response ratings and cards. Service managers can create and edit records. Workshop managers can view them. Users with cross-branch access can use the branch selector to work in another branch.

- **Attribute master** stores the code, description, short description and default weightage.
- **Response master** stores the code, description and default positive marks.
- **Card master** stores its code, description, card and effective dates, applicability, ordered questions and rating choices. Adding a master row prefills its weight or marks. The card must contain at least one attribute, at least two responses and weights totalling exactly 1.0.
- Inactive attributes and responses remain available to historical card revisions. New card rows must use active masters. Staff deactivate records by clearing **Active** and saving.

Card saves append an immutable revision. Each revision owns its question and rating text, weights and marks. Concurrent edits to the same revision receive a conflict. The master API records a CSI master audit entry for saves.

No legacy master export is bundled. Use verified business master data when configuring a branch. Do not substitute sample attributes for the verified legacy questions.

## Card generation and printing

Open CSI card generation, select a workshop branch, and load delivered jobs. Filters support inclusive Lagos job-opening dates, job-number bounds, job type, model, dependent variant and exact registration. Each filter can be set to All. Results are sorted before pagination. Narrow the dates or other filters if more than 1,000 delivered jobs match; results are never silently truncated.

Select up to 25 jobs and prepare their questionnaires. An active card revision must be effective on or before the job-opening date and match the shared accidental service category. On the same effective day, a specific applicability takes precedence over Both; the latest version of the same card is used. An unknown job type can only use Both. TODO(confirm): equally applicable cards from different masters are rejected until the service manager corrects their applicability/effective dates.

Issuance locks each job and the card masters in its transaction. A unique survey per job prevents duplicate cards, including concurrent requests. The survey retains its card revision and a snapshot of the job, vehicle, customer and contacts. Reprints reuse this snapshot after later job or master changes. Preparation and print loading create audit entries. Use Print questionnaires for paper or Save as PDF in the browser print dialog. Each questionnaire starts a new printed page, with response spaces and customer signature/date areas.

## Response entry and corrections

Find an issued questionnaire by job number in CSI card responses. Its original card, questions, ratings and job/contact details are read-only. Every question must receive one of the issued card's responses. The response date must be from the generation day through today in Africa/Lagos. Comments allow up to 2,000 characters.

Response saves use a branch-scoped row lock and version check. A stale edit is rejected before replacing answers. Corrections retain the complete previous and new answers, comments, dates and decimal scores in the audit trail. A later master change never recalculates a saved response.

TODO(confirm): the implemented proposed weighted formula is sum(weight x marks), with percentage equal to score divided by the maximum marks on the issued card, multiplied by 100. All questions are required, so no blank-answer reweighting occurs. Weights, products, percentages and averages use decimal arithmetic. Confirm this formula and approved satisfaction bands with the business before rollout. No unconfirmed satisfaction bands are assigned.

## Reports and permissions

The existing reports framework supplies the CSI report, attribute-wise CSI analysis and customer checklist, including print and Excel export. Only responded surveys are included. Optional response-date ranges use Lagos days; card, attribute and response choices include inactive masters for historical use. Summary reports also support job bounds, registration, model, variant and service type from issuance snapshots. Formula sections use stored weights and marks and are included in print/export data. Attribute analysis includes zero-count rating choices and distinguishes changed question wording. Reports reject more than 2,000 matching surveys rather than return incomplete averages.

Generation/printing requires `csi:card:generate`. Response reading and updating require `csi:response:read` and `csi:response:update`. The three reports have separate permissions: `report:csi`, `report:csi-attribute`, `report:csi-checklist`. Grants are maintained in ROLE_PERMISSIONS for the role seed; the frontend mirrors the eight identifiers in CSI_PERMISSIONS. Existing branch and cross-branch checks are retained.

| Role | Masters | Generate / print | Responses | Reports |
| --- | --- | --- | --- | --- |
| SuperAdmin | Read and update | Yes | Read and update | All three |
| Admin | Read and update | Yes | Read and update | All three |
| ServiceManager | Read and update | Yes | Read and update | All three |
| WorkshopManager | Read only | No | Read only | All three |
| Auditor | Read only | No | Read only | All three |
| CCUManager | No | Yes | Read and update | No |
| CCUOfficer | No | Yes | Read and update | No |

Other built-in roles receive no CSI grants. TODO(confirm): review this issue's role matrix with the business before rollout. Migration `20261124140000_csi_permissions` registers all eight assignable actions and adds the default grants to existing built-in roles without resetting any assignments. Deploy the pending migrations in the approved environment, then refresh staff sessions. The canonical defaults remain in `ROLE_PERMISSIONS` for future seeds. No non-local database is updated by changing these files.

In Settings > Roles, expand **Customer satisfaction (CSI)** to assign masters, questionnaire generation, response entry and the three report permissions. Each action has a distinct label. This section appears after the permission migration is applied; updating source constants alone does not populate the database permission catalog.

## Migration and rollback

The additive migration `20261123120000_csi_masters` creates the three branch-scoped masters, card revisions and ordered detail rows. Branch/code unique indexes prevent duplicate codes. Composite foreign keys enforce branch consistency. The revision branch/applicability/effective-date index supports later card selection. No existing records are backfilled.

The role seed applies the CSI role matrix above, rebuilding built-in role grants from ROLE_PERMISSIONS on every run. Admin receives explicit CSI grants; only SuperAdmin has the frontend permission bypass. ServiceManager is included in the frontend's normalized role type and legacy workshop role list.

The additive migrations `20261124120000_csi_survey_issuance` and `20261124130000_csi_survey_responses` add issued surveys, branch-consistent job/revision foreign keys, unique job issuance, versioned response fields and answer snapshots. Both applied successfully with the complete migration chain in a fresh disposable localhost database. A transactional rollback rehearsal preserved the survey and answer data. The configured application database was not changed. Apply these migrations and `20261124140000_csi_permissions` in the intended environment before enabling the new screens. A full role reseed is not required for this rollout. To disable operations, remove their grants/navigation and preserve issued surveys and their answers; do not drop populated tables.

Local API and browser verification evidence is recorded in [the verification summary](./progress/issue-112-visual/README.md). Report summaries and the screen/Excel total row now show average scores. Mobile empty results wrap without requiring horizontal scrolling; disabled filters are visibly muted. CSI access denial uses an in-place message while other dashboard routes retain their normal guard behavior.

To disable the feature, remove its grants and revert the route and navigation registration. Preserve the tables if populated. On an empty disposable environment, remove the detail tables, revisions, cards, responses and attributes in dependency order, then remove the CSI applicability enum. Apply the appropriate Prisma migration history workflow for that environment.
