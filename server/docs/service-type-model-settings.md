# Job-card service types (issue #72)

Job-card opening selects a WorkshopMaster SERVICE_TYPE. The vehicle's catalogue
entry is followed through its parents to a WorkshopMaster MODEL. Only active
model settings and active masters are eligible. A non-null Vehicle.saleDate is
the existing signal for a sold vehicle; pre-delivery types are hidden for it.
AF is always excluded. Without an explicit workshop catalogue link, the query
uses the linked VehicleCatalogModel (including its aliases) or saved physical
make/model text to match a workshop MODEL. The warranty-policy VehicleModel
never overrides the physical vehicle identity. Matching is
exact after punctuation/case normalization and requires the same make and
exactly one matching model. Ambiguous, unmatched or broken explicit links
produce an empty list with a configuration message. A name alone is never used
to choose a model from another make.

The lookup uses one parameterized recursive SQL query, with cycle protection
and an index on modelId, active, serviceTypeId. The client fetches the eligible
list once per vehicle/date and searches descriptions and codes locally.
Display order precedes code order; unset display orders sort last.

Charges use previousCharge before effectiveFrom and serviceCharge on or after
that date. Date-only inputs use UTC midnight. The opening form permits a manual
override, including zero; the server validates eligibility again and supplies
the configured charge if no override was submitted. The job's stored charge
continues through estimates, approval and billing. Existing appointment-linked
serviceId references remain supported; new workshop-only jobs use serviceTypeId.

Admins manage model settings in Settings > Workshop masters > SERVICE_TYPE >
Edit. Model/type pairs are unique, and their identities cannot change on edit.
The settings API is paginated and documented in Swagger. The options API
requires jobcard:create; settings CRUD requires Admin or SuperAdmin.

## Rollout

Run from server with the usual environment configuration:

```powershell
npm run prisma:deploy
npm run prisma:generate
npm run prisma:seed:service-types
```

Restart the backend and release the updated client together. The additive
migration creates the settings table and adds two WorkshopMaster fields.
It does not remove existing jobs or catalogue records. Apply it before serving
the updated application. The focused seed sets up the legacy service codes and
RIO charges without running unrelated inventory/customer seeds. Re-running it
preserves existing model charge settings and administrator edits, apart from
marking PD/BD as pre-delivery, retiring PS/F1/AF placeholders and correcting the
original seeded RR description. Existing placeholder references remain intact.

Other models need their own settings. Free/prepaid eligibility, repeat-job
linking remain outside this issue. Matching identities does not rewrite existing
vehicle records or invent missing model charge settings.

## Verification

Backend Jest tests cover charge dates, validation, access control and existing
job/estimate/billing flows. The focused PostgreSQL harness applies the complete
migration history to an isolated PGlite database and checks sold/unsold RIO
lists, nested catalogue resolution, inactive records, cycles and query count.
The React harness exercises the actual picker and settings grid, including
keyboard selection, local search, overrides, vehicle changes and settings CRUD.
Their dependencies live outside the project and are supplied explicitly:

```powershell
node prisma/tests/service-type-options.cjs <path-to-pglite-package>
# From client:
node tests/service-types.cjs <directory-containing-test-node_modules>
```

The local lookup benchmark excludes network latency and production concurrency;
it is not a production response-time guarantee.
