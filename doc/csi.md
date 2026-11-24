# Customer satisfaction index

CSI masters are available under Workshop, CSI masters. Each workshop branch maintains its own attributes, response ratings and cards. Service managers can create and edit records. Workshop managers can view them. Users with cross-branch access can use the branch selector to work in another branch.

- **Attribute master** stores the code, description, short description and default weightage.
- **Response master** stores the code, description and default positive marks.
- **Card master** stores its code, description, card and effective dates, applicability, ordered questions and rating choices. Adding a master row prefills its weight or marks. The card must contain at least one attribute, at least two responses and weights totalling exactly 1.0.
- Inactive attributes and responses remain available to historical card revisions. New card rows must use active masters. Staff deactivate records by clearing **Active** and saving.

Card saves append an immutable revision. Each revision owns its question and rating text, weights and marks. Concurrent edits to the same revision receive a conflict. The master API records a CSI master audit entry for saves.

No legacy master export is bundled. Use verified business master data when configuring a branch. Survey issuance, response entry and reports are subsequent slices.

## Migration and rollback

The additive migration `20261123120000_csi_masters` creates the three branch-scoped masters, card revisions and ordered detail rows. Branch/code unique indexes prevent duplicate codes. Composite foreign keys enforce branch consistency. The revision branch/applicability/effective-date index supports later card selection. No existing records are backfilled.

The role seed applies `csi:master:read` and `csi:master:update` to the service manager and `csi:master:read` to the workshop manager.

To disable the feature, remove its grants and revert the route and navigation registration. Preserve the tables if populated. On an empty disposable environment, remove the detail tables, revisions, cards, responses and attributes in dependency order, then remove the CSI applicability enum. Apply the appropriate Prisma migration history workflow for that environment.
