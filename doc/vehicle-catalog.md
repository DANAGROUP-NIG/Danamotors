# Vehicle catalogue

The catalogue follows the existing Express/TypeScript, Prisma/PostgreSQL, Next.js,
React Hook Form, Zod and React Query stack. No dependencies or services were added.
The original uploaded Kia file is stored unchanged at `server/data/kia.json`.

## Run

From `server`, using the configured `DATABASE_URL`:

```sh
npm run prisma:deploy
npm run prisma:generate
npm run prisma:seed:vehicles
npm run vehicles:review-custom
npm test -- --runInBand
```

The catalogue seed is explicit; it does not run unrelated application seeds. It
validates the whole file, takes a transaction-scoped advisory lock and performs
parameterized batches of 100 rows in one transaction. An error rolls back the
entire import. Output distinguishes inserted and updated rows per table. A repeat
run updates existing records, including unchanged records, without duplicating
or deleting them. Names, numeric nulls and specification JSON are preserved.

To run the optional PostgreSQL seed integration test in PowerShell:

```powershell
$env:CATALOG_DATABASE_TEST = '1'
npm test -- --runInBand src/modules/vehicle-catalog/catalog.integration.test.ts
Remove-Item Env:CATALOG_DATABASE_TEST
```

This test uses temporary tables that shadow the catalogue tables on its transaction
connection. It rolls back all test tables and rows and never changes application
catalogue rows. The connection needs temporary-table privileges. The separate
workshop integration suite still requires its own disposable `TEST_DATABASE_URL`.

## Source-data decisions

- `Ceed` and `cee'd` both normalize to `ceed`. A unique make/search-name key would
  merge or reject supplied records, so uniqueness is make plus original display
  name, with a make/search-name index for lookup. All 47 names remain distinct.
- Six generation natural keys repeat with different engine lists, and one engine
  label repeats within a generation. A zero-based occurrence ordinal extends those
  natural keys. Stable IDs and ordinals preserve all 141 generations and 629 engines.
  Keep duplicate source entries in their original order on future imports; review
  identity mapping before reordering or deleting duplicate occurrences.
- One generation has an empty engine list. It remains selectable without an engine.
- Existing vehicles are altered in place. Their original make/model are copied to
  nullable custom fields. Missing legacy models use `Unspecified (legacy)` to meet
  the database check without deleting or overwriting original display fields.
- Existing workshop catalogue/colour links survive metadata-only edits and legacy
  API payloads remain supported. Explicitly choosing a new model replaces those
  links. The new Kia catalogue does not infer workshop labour/warranty mappings.

## API and UI

Authenticated staff endpoints follow the existing `{ status: "success", data }`
response envelope:

- `GET /api/vehicle-catalog/models`: only ID, make, name, normalized search name,
  slash aliases and year range.
- `GET /api/vehicle-catalog/models/:id/options`: generations and compact engine
  choices; never engine `specs`.

Both have `Cache-Control: public, max-age=86400` and content ETags. The server
coalesces concurrent reads and caches up to 256 responses for one day. Catalogue
changes become visible after cache expiration or a server restart. Existing
browser sessions keep their cached lists until a reload. The seed does not publish
an invalidation event.

The Add/Edit Vehicle form and inline Add Vehicle modal share `VehicleModelFields`.
One cached model fetch serves all instances; typing searches locally and shows at
most eight catalogue results plus an Add option when no normalized exact match
exists. Slash aliases are searchable. Generation/engine choices load only after
model selection. Keyboard arrows, Enter and Escape are supported. Theme tokens
preserve the application's colours, and optional choices stack on small screens.
A failed catalogue request allows plain-text custom entries and offers retry.

Custom models are stored only on vehicles. The API normalizes whitespace, limits
custom fields to 80 characters, rejects empty or conflicting identities, and
verifies generation/model and engine/generation ownership. Unknown models return
an error instead of trusting client IDs. Changing a parent selection clears its
old children. Custom review groups lowercase, trimmed model names by frequency.

## Verification (2026-09-30)

- Migration `20260930100000_vehicle_catalog` applied successfully.
- First seed: 1 make, 47 models, 141 generations and 629 engines inserted.
- Second seed: zero inserts; 1 / 47 / 141 / 629 rows updated. Database counts unchanged.
- No vehicles missing a model identity after migration.
- Actual compact model response: 7,290 bytes; 2,105 bytes when gzip-compressed
  (compression depends on deployment/proxy configuration).
- Isolated PostgreSQL test passed: empty catalogue, repeat seed, stable IDs,
  numeric nulls, untouched specs and malformed-input atomicity.
- Automated route tests cover compact projections, caching, ETag/304 and unknown
  models. Service tests cover creation, edit compatibility and invalid relations.
- Final full suite with catalogue integration enabled: 90 tests passed; one
  workshop integration test skipped because no disposable workshop test database
  was supplied. Focused frontend lint passed with three existing `any` warnings.
- Frontend and backend production builds passed. No frontend component-test setup
  exists; live browser verification remains a manual follow-up because no browser
  surface is connected in this environment.

## Customer linkage in vehicle forms

New vehicles added through the frontend require a valid customer selection.
`VehicleCustomerField` uses the existing searchable picker and customer-detail
API to show the selected customer's name, code and contact details. Contextual
Add Vehicle modals inherit and display their parent customer as read-only.
Vehicle choices are filtered by customer on the server, rather than filtering an
unrelated first page in the browser. Creation refreshes customer details and
vehicle queries without inserting records into other customers' cached lists.

Existing stock vehicles remain editable under the nullable schema relationship.
Editing vehicle metadata displays the current customer; changing ownership uses
the dedicated ownership endpoint and effective date, preserving ownership history.
Customer details for both owners are refreshed after a transfer. The API already
checks that a customer exists and is not merged, and creates the vehicle and its
initial ownership in one transaction. Regression tests cover these relationships.
