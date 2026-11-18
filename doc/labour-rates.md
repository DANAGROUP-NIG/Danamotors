# Model labour rates

Settings → **Model labour rates** (`/settings/labour-rates`) holds the hours and rate of each labour on each
model (`LabourRate`, one row per labour × model; the model is a `WorkshopMaster` of kind `MODEL`).

- **TIME** pricing: charge = hours × hourly rate.
- **FIXED** pricing: charge = the fixed amount, held in `rate`.

A job card line uses the model's active rate when there is one, otherwise the labour item's own rate.

This replaces legacy's **Labour Rate Update Utility**, which imported rates from XLS. There is no upload:
the branch has about 69,600 rates (63 models × about 6,300 labours), and they are maintained in the grid.

## The screen

| Part | What it does |
| --- | --- |
| Filters | Model, vehicle system, group, pricing, active/inactive, and a search over labour and model code and description. 100 rows a page. |
| Grid | Inline edit of pricing, hours and rate (saved on Enter or leaving the cell; Escape reverts), and an active switch. The Charge column shows what a job card would charge. |
| **Change selected / Change all N** | One change for the ticked rows, or for every row the filter matches: change rate by % (rounded to the kobo, ₦1, ₦5, ₦10, ₦50 or ₦100), set rate, set hours, set pricing, activate or deactivate. |
| **Add labour to models** | Adds one labour to many models at once (ABJ added labours to 42 models at a time). Every active model is ticked to start. Models that already have the labour keep their rate unless "replace" is ticked. |
| **Copy model rates** | Copies every rate of one model to the chosen models, for a new model, optionally a % dearer or cheaper. Existing rates are kept unless "replace" is ticked. |

Every bulk change is **previewed** first: how many rates match, how many will change and, for the bulk
change, a sample of old and new values. Applying sends the previewed count; if the rates changed in
between, the server refuses (409) and asks for a new preview.

## Permissions

| Permission | Allows | Default roles |
| --- | --- | --- |
| `labour-item:read` | See the grid | Admin, Workshop Manager, Service Manager, Service Adviser, Warranty Officer, Auditor |
| `labour-rate:update` | Inline edit and every bulk change | Admin (SuperAdmin has everything) |

`labour-rate:update` replaced the old Admin/SuperAdmin role check on `POST /service/labour-rates`, so it can
also be granted to one user (see [roles-and-permissions.md](./roles-and-permissions.md)). Migration
`20261105150000_labour_rate_permission` creates it and grants it to Admin.

## API (`/api/service/labour-rates`)

| Endpoint | Body / query | Notes |
| --- | --- | --- |
| `GET /grid` | `modelIds` (comma-separated), `labourItemIds`, `vehicleSystem`, `group`, `search`, `pricing`, `active`, `page`, `limit` (≤ 500) | Rows with model and labour code/description, `meta.total` |
| `GET /options` | | Models with their rate counts, vehicle systems and groups in use |
| `PATCH /:id` | `pricing`, `hours`, `rate`, `active` | One rate |
| `POST /bulk` | `scope: { ids } \| { filter }`, `action: { type: SET_HOURS \| SET_RATE \| CHANGE_PERCENT \| SET_PRICING \| SET_ACTIVE, … }` | |
| `POST /apply-to-models` | `labourItemId`, `modelIds` (omit = every active model), `pricing`, `hours`, `rate`, `active`, `overwrite` | |
| `POST /copy-model` | `fromModelId`, `toModelIds`, `overwrite`, `percent`, `roundTo` | |

The three `POST`s take `dryRun: true` for the preview, and `expected: <previewed count>` to apply. The older
`GET` / `POST /service/labour-rates` (one model × labour) remain.

## How a bulk change is written

Each is one set-based SQL statement in one transaction (up to 3 minutes), never one request per row. Only
rows whose value actually changes are written. The `LabourRate` change-log trigger records each changed row
with the user (see [audit-log.md](./audit-log.md)), so a change of 6,300 rows writes 6,300 change-log rows.
One business event in the Events tab summarises it:

| Event | Details |
| --- | --- |
| `LABOUR_RATE_BULK_UPDATE` | rows changed, rows matched, the action, the filter or the number of ids |
| `LABOUR_RATE_APPLY_TO_MODELS` | the labour, created / replaced / kept, the values, the models |
| `LABOUR_RATE_COPY_MODEL` | source and target models, created / replaced / kept, % and rounding |

**Timing.** Measured on a laptop with 63 models × 1,100 labours (69,300 rates): preview 0.6 s; +5 % on all
69,300 rates 26 s; copying one model's 1,100 rates to 62 models (68,200 new rows) 21 s; a grid search
0.5 s. Most of the write time is the change-log trigger. The screen warns when a change exceeds 5,000 rows.
