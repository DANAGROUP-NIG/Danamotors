# Vehicle add/edit catalogue selection

Staff add, edit and inline-create forms default to VehicleCatalogModel, with
dependent generation and engine choices from the database information tables.
Make and compact engine properties are displayed from that data; no engine
specifications JSON is downloaded. Model search runs locally over the shared
compact list; generation/engine options load only for the selected model.
Typing a search does not erase the saved selection before an option is chosen.

Workshop variants remain an explicit alternative and remain selected for
existing workshop-linked vehicles. Selecting one populates catalogueId/colourId
and derives make/model/trim/colour on the server. Metadata-only edits preserve
existing identities. Changing a model/generation clears dependent selections.
The VehicleModel selector continues to assign a separate warranty policy.
Existing records are not automatically remapped.

GET /vehicle-catalog/workshop-variants performs an authenticated, compact search
through active make/product/model/variant entries in one joined query. Search
matches all whitespace-separated tokens, treating wildcard characters literally.
The UI requests at most 20 rows, waits 250 ms after typing, reuses results for
60 seconds and cancels superseded requests. No total-count query or catalogue
download is needed. When a list is capped, the user searches more specifically.

GET /vehicle-catalog/workshop-variants/:id loads the saved entry and its model's
colours directly in one query. Saved inactive entries remain displayable. Colour
search runs locally. Changing variants clears the old colour. Saving a changed
identity validates the active hierarchy and model-specific colour together in
one query; the existing kind/active, parent and primary-key indexes support it.

Service eligibility follows an explicit workshop catalogue link first. Other
vehicles resolve through an exact normalized make/model match, using catalogue
aliases when available. Exactly one workshop model must match; wrong makes,
ambiguity and broken explicit links never select arbitrary pricing. All model
resolution and eligible settings remain in one parameterized query.
Warranty policy links are not physical model identities and never choose service
pricing. An empty list names the missing model/configuration and lets an admin
open Workshop masters and refresh the list after configuring it.

The customer request dropdown reads active WarrantyDefectCode rows through
GET /job-cards/defect-codes, which requires jobcard:create permission. Results
contain only id/code/description, are bounded, debounced, cancellable and cached.
Selection fills the editable description. The stored defect code is kept
separate from WorkshopMaster complaint foreign keys. Saving batches default
descriptions and validation rather than querying for each request row. Existing
complaint links and described imported estimate codes remain supported.

These fixes require no additional schema migration. Restart the backend and
release the updated client together. The preceding service-type feature still
needs its documented migration and seed. Configure model charges when the
matching workshop model has no service settings.

Verification: vehicle API/service Jest tests, the isolated PostgreSQL harness
prisma/tests/workshop-vehicle-catalog.cjs, React harness
client/tests/vehicle-catalogue.cjs and client/tests/service-types.cjs, service
model resolution through prisma/tests/service-type-options.cjs, TypeScript and
client lint. The isolated
harnesses accept external test dependency paths, like the service-type harnesses.

## Kia catalogue availability

The model selector reads `VehicleCatalogModel`, `VehicleCatalogGeneration` and
`VehicleCatalogEngine`; workshop masters and warranty policy models are separate.
On 2026-10-07 the configured database had zero rows in all three catalogue tables.
The standalone Kia seed restored 1 make, 47 models, 141 generations and 629 engines.
The full database seed now also invokes this same idempotent seed so normal database
setup includes the reference data. It does not remap existing vehicles.

For an already migrated environment, run `npm run prisma:seed:vehicles` from
`server`. This only upserts the supplied catalogue; do not run the full demo seed
just to restore reference data. Allow the API's 60-second cache to expire and
refresh the catalogue or reopen the modal. Empty catalogues now show a distinct
message and a refresh action instead of appearing to be an empty search.

Create, edit and inline-create use the shared identity selector. Choose
"Kia model catalogue and specifications"; searching `Kia Rio` matches both the
make and the model/aliases without suggesting a duplicate custom model. Existing
workshop-linked vehicles retain their identity until explicitly changed. Regression
coverage includes replacing a workshop identity with all three Kia IDs, saved Kia
selections, dependent resets and recovery after an empty catalogue is populated.

Explicit catalogue refresh bypasses browser response caching and the API's
in-memory cache. Empty model/options lists use `Cache-Control: private, no-store`
and are not retained in the API cache. This lets the frontend recover after a
seed without repeatedly receiving a cached empty response. Normal populated
reads retain the short cache and ETag behavior. API and React regression tests
cover refreshing an empty catalogue after data becomes available.
