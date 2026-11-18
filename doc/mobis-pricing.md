# Mobis pricing (Finance)

**Finance → Parts pricing → Mobis conversion rate and price bulletins** (`/finance/mobis-pricing`).
Code: `server/src/modules/finance/mobis-pricing.*`, `client/features/finance/components/mobis-pricing-workspace.tsx`,
`client/features/finance/lib/parse-price-bulletin.ts`. Permission: `mobispricing:manage` (Accountant; SuperAdmin has all).

Finance is the authority on Mobis prices. It owns three things:

| What | Where it is used |
|---|---|
| **Conversion rate** (₦ per US$, now 2700) | Every new Mobis MIT records it; the MRN costs stock at it. The store sees it on Upload MIT but cannot change it. |
| **Dealer factor** (share of the US$ list price Mobis charges, now 0.616, as in the DateManager tool) | Bulletins: dealer rate = list × rate × factor (2700 × 0.616 = ₦1,663.20 per $1). |
| **Price runs** | Bulletins and rate-change revaluations, listed under *Price runs* with every part they changed. |

Both values live in `FinanceSetting` key `mobisPricing` (`{ conversionRate, dealerFactor }`); changes are in the
audit log (`MOBIS_PRICING_UPDATED`) and the change log.

## Rule: prices only go up

A part's dealer rate is changed only when the new one is higher. This is the legacy rule (DateManager tool,
`WHERE new > dlrrate`) so the company never sells below the last price it set.

## Mobis price bulletin

Upload the file as Mobis sends it, e.g. `KIA - Irregular Price Adjustment 06-11-2026 - Others.xlsx`. Every sheet
with a `Part No.` header is read (MAIN and NO SALES). Only **Part No.** and the **New** US$ list price (under
*List Price ($)*) are used; the title row becomes the reference and *Go Live* the effective date.

For each part number that is a Mobis part in Part Master (not a local/used/repaired source record):

- new dealer rate = new list × conversion rate × dealer factor, rounded to kobo;
- if it is higher than today's dealer rate: retail rate = new dealer rate × the part category multiplier
  (a part with no category keeps its present retail/dealer markup);
- otherwise the part is left alone ("Not higher: kept").

The preview shows *Goes up*, *Not higher: kept* and *Not in Part Master* before anything is saved. Applying is
refused if the rate or factor changed since the preview, or if the same bulletin reference was already applied.
Each changed part gets a Part Rate History row linked to the run.

## Raising the conversion rate

When Finance raises the rate, it can also raise the dealer and retail rates of every Mobis part (flags **O** and
**A**) by new rate ÷ old rate. Local (**L**) and FOC (**F**) parts are priced in naira and left alone. Lowering
the rate never lowers prices.

This is what legacy did by hand: every whole-catalogue batch in PartRateHistory matches a CPD MIT rate change
(e.g. 26 Aug 2024 ×1.421 = 1900 → 2700), applied to O and A parts only, run as SUPERVISOR in each branch database.

## Legacy

Legacy had no screen for this. The rate was typed on each MIT by the store (`MATERIALINTRANSITHEAD.conversionfactor`);
`SettingMaster` holds only currency names, and the `ConversionFactor` columns on `Category`/`partmast` are unit
factors (all 1). Bulletins were loaded into `TMP_KIAPRICE` (OldLP/NLP) or run through the DateManager tool, and
whole-catalogue changes were SQL batches. Analysis: `dana_projects/mobis_pricing_legacy_insights.md`.
