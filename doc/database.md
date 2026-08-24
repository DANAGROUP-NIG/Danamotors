# Database

PostgreSQL via Prisma ORM. Schema: `server/prisma/schema.prisma`. Migrations:
`server/prisma/migrations/` (applied with `prisma migrate deploy`).

## Entity overview

```
Branch ─┬─ User ── Role ──┬─ Permission
        │                 └─ RolePermission
        │   User ── RefreshToken
        │   User ── AuditLog
        │
        ├─ Customer ─┬─ Vehicle ─┬─ VehicleImage
        │            │           └─ VehicleOwnership
        │            ├─ CustomerDocument
        │            ├─ ServiceHistory
        │            ├─ ServiceAppointment ── JobCard
        │            └─ Invoice
        │
        ├─ SparePart ── InventoryStock (per branch)
        │              StockTransaction
        │              InterBranchTransfer ── InterBranchTransferItem
        │              PurchaseRequest
        │
        ├─ JobCard ── Inspection
        │           ── Estimate ── CustomerApproval
        │           ── PartIssuance ── PartReturn
        │           ── Invoice
        │
        ├─ Invoice ── Payment
        │          ── Receipt
        │
        └─ Notification (per user)
```

## Core models

### Identity & access

| Model | Notes |
| --- | --- |
| `Branch` | Workshop locations; `name` unique. Stock, customers, and service records hang off a branch. |
| `User` | Staff account. `email` unique, `passwordHash`, `isActive`. Optional `branchId` (users can be branch-scoped). `resetTokenHash` + `resetTokenExpiry` for password resets. |
| `Role` | Named role; name unique. |
| `Permission` | Individual permissions. |
| `RolePermission` | Many-to-many join between `Role` and `Permission`. |
| `RefreshToken` | Hashed refresh tokens (SHA-256), `token` unique, with `expiresAt`. |
| `AuditLog` | User actions (login, register, profile updates, password resets, etc.). |

### Master data

| Model | Notes |
| --- | --- |
| `Customer` | Vehicle owner. `email` unique, `branchId` required (branch scoping). |
| `Vehicle` | Belongs to a customer via `Customer.vehicles`; `registrationNumber` added in the inventory/transfers migration. |
| `VehicleImage` / `VehicleOwnership` | Vehicle photos and ownership history. |
| `CustomerDocument` / `ServiceHistory` | Customer files and past-service log. |

### Service pipeline

| Model | Notes |
| --- | --- |
| `ServiceAppointment` | Booking (`scheduledAt`, status default `Pending`), created by a receptionist. |
| `JobCard` | The repair work order: `jobNumber` unique, `status` (default `Open`), `estimatedHours/Cost`, `progress`, `qcStatus`, technician/quality-inspector assignments. |
| `Inspection` | Vehicle inspection on a job card (`findings`, `passed`, `status`). |
| `Estimate` | Quotation for a job card. |
| `CustomerApproval` | Customer decision on an estimate (`approved`, `decisionDate`, `comments`). |

### Inventory

| Model | Notes |
| --- | --- |
| `SparePart` | Part catalog (`partNumber`, `name`, `unitPrice`). Stock is NOT stored here anymore. |
| `InventoryStock` | Per-branch part quantities: `quantity`, `reservedQuantity`, `minimumStock`, `maximumStock`, `rackLocation`. Drives the dashboard inventory alerts. |
| `StockTransaction` | Ledger of every stock movement (`type`, `quantity`, `referenceId`, `recordedById`). |
| `InterBranchTransfer` | Transfer of parts between branches: `requestingBranchId`, `sourceBranchId`, lifecycle `Pending → Approved → Dispatched → Received` (or `Rejected`/`Cancelled`). |
| `InterBranchTransferItem` | Line items on a transfer. |
| `PurchaseRequest` | Parts to procure (`status`). |
| `PartIssuance` / `PartReturn` | Issue parts against a job card and return unused ones. |

### Finance

| Model | Notes |
| --- | --- |
| `Invoice` | `invoiceNumber` unique, `subtotal/tax/total`, `status` (default `Unpaid`). Linked to a customer, optionally a job card. |
| `Payment` | `recordedById` (from JWT), `amount`, `method`, `paymentDate`. Recording updates the invoice status to `Partially Paid` / `Paid`. |
| `Receipt` | `issuedById` (from JWT), `amount`, `issuedAt`. |

### Notifications

| Model | Notes |
| --- | --- |
| `Notification` | In-app notification, `isRead` flag, optional `link` and `type`. Sent per user or to an entire role in a branch (e.g. `INVOICE_PAID`). |

## Key design notes

- **Branch scoping** — customers, stock, and service records carry `branchId`.
  Non-SuperAdmin API users are restricted to their own branch both at list level and on
  single-record lookups (see `doc/architecture.md` → Branch isolation).
- **Stock is per-branch** — `SparePart` holds the catalog; quantities live in
  `InventoryStock`. The legacy `SparePart.stock` / `SparePart.minimumStock` columns were
  dropped by migration `20260806100000_add_inventory_transfers_notifications`.
- **Migrations are idempotent** — statements use `IF [NOT] EXISTS` and existence-checked
  constraints so they can run on both fresh and existing databases.

## Author

Built by **buildwithzeke** (Aye Oluwaseyi) — <ayeoluwaseyi@gmail.com>
