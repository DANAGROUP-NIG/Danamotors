# Vehicle identity

A vehicle's **identity** is what says which vehicle it is: VIN, registration, engine number, model (catalogue
model, generation, engine, variant, custom make and model, warranty policy model), year and sale date (the
warranty start).

Legacy protected every vehicle-master edit with one shared password (`SettingMaster.VehicleUpdatePassword`, set in
all three databases), which recorded nobody. Here:

- Changing an identity field needs **`vehicle:identity:update`** (Admin by default; SuperAdmin has every
  permission; grant it to others per user, see [roles-and-permissions.md](./roles-and-permissions.md)). Ordinary
  edits (key number, colour, selling dealer, fitment, sale invoice…) stay under `vehicle:update`.
- Every identity change needs a **reason** (at least 5 characters).
- The VIN can now be corrected (before, the edit form could not change it at all). A corrected VIN is linked to
  campaigns listed under it, as at creation.

On the edit form, users without the permission see the identity fields locked with a note. With the permission, a
"Reason for changing the vehicle's identity" box appears as soon as one of them changes.

## How it is enforced and recorded

`PUT /api/vehicles/:id` (`vehicle-identity.ts`, `vehicle.service.ts`):

1. Compares each identity field sent with the stored value (text ignoring case and spaces, dates by day). Fields
   sent unchanged, as the full edit form does, do not count.
2. If any changed: 403 without the permission, 400 without a reason.
3. Writes a `VEHICLE_IDENTITY_UPDATED` audit event in the same transaction: the changes (from → to), the reason,
   and the database transaction id.

The before and after values are also in the change log (Vehicle trigger, [audit-log.md](./audit-log.md)).

## Identity history

The vehicle page has an **Identity history** section (`GET /api/vehicles/:id/identity-history`, `vehicle:read`):
every change to the identity fields and the make, model and trim they resolve to, oldest record first in the API
and newest first on screen, with who made it and the reason. It reads the change log, so it also shows the
values at creation, changes made before this check existed, changes through the warranty dialog, and changes
made outside the app. The reason is matched to its change by the transaction id, so it is exact.

## Not covered

The vehicle warranty dialog (`PUT /api/vehicles/:id/warranty`) still sets the sale date and warranty policy model
under `warranty:update`, without a reason: that is the warranty officers' job. Those changes appear in the
identity history from the change log, with "Not recorded" as the reason.
