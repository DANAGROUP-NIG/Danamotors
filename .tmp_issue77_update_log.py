import re
from pathlib import Path

path = Path('doc/issue-77-frontend-acceptance-results.md')
text = path.read_text(encoding='utf-8')

# 1) Insert FIFO preview date filtering fix right after same-day adjustment fix section.
insert_after = "## Backend fix (enables same-day adjustments)"
if "## Backend fix (FIFO preview date filtering)" not in text:
    m = re.search(r"(## Backend fix \(enables same-day adjustments\)[\s\S]*?^Fix applied\n- Compare by calendar day \(UTC\) for both document date and latest activity date\.)\n", text, flags=re.M)
    if not m:
        raise SystemExit('Could not locate same-day adjustment fix block to insert after')
    fifo_block = "\n## Backend fix (FIFO preview date filtering)\n\nProblem\n- FIFO preview could incorrectly exclude same-day documents and return toast: `No outstanding debits and available credits can be matched`.\n- Root cause: FIFO SQL used a full timestamp comparison against `now`/selected date (timezones made \"same day\" documents appear in the future).\n\nFix applied\n- In `server/src/modules/finance/party-account.service.ts`, FIFO preview and funding-credit selection now compare by calendar date:\n  - from `date <= ${date}`\n  - to `d.date::date <= ${date}::date`\n- Note: an intermediate attempt using `date::date` caused a 500 due to ambiguity; the final fix qualifies the column with alias `d`.\n"
    text = text[:m.end(1)] + fifo_block + text[m.end(1):]

# 2) Replace the Fixture B reversal block with the expanded timeline + FIFO sections.
old_reversal = (
"Reversal\n"
"- Reversed the batch with reason: `Issue77 acceptance test reversal`\n"
"- Observed:\n"
"  - Batch status changed to Reversed, reason displayed\n"
"  - Balances returned to: Outstanding NGN 10,000; Unadjusted credits NGN 7,000; Net balance NGN 3,000\n"
)
new_reversal = (
"Manual adjustment reversal (verification)\n"
"- Reversed the adjustment once to confirm reversal UI/permissions.\n"
"- Reason used: `Issue77 acceptance test reversal`\n"
"- Observed:\n"
"  - Batch status changed to Reversed and reason displayed\n"
"  - Balances returned to: Outstanding NGN 10,000; Unadjusted credits NGN 7,000; Net balance NGN 3,000\n\n"
"Manual adjustment (restored baseline for later phases)\n"
"- Created another adjustment of NGN 3,000 between debit NOTE 2026000002 and receipt 2026000009.\n"
"- Current balances for Fixture B baseline (with adjustment Active):\n"
"  - Outstanding: NGN 7,000\n"
"  - Unadjusted credits: NGN 4,000\n"
"  - Net balance: NGN 3,000\n\n"
"FIFO scenario (post FIFO-date fix)\n"
"- With Fixture B baseline above, executed FIFO preview and saved two FIFO batches:\n"
"  - FIFO batch 1: NGN 2,000 (consumed opening credit NOTE)\n"
"  - FIFO batch 2: NGN 2,000 (consumed remaining advance-receipt credit)\n"
"- Observed after both FIFO batches Active:\n"
"  - Outstanding: NGN 3,000\n"
"  - Unadjusted credits: NGN 0\n"
"  - Net balance: NGN 3,000\n\n"
"FIFO reversal (restore baseline)\n"
"- Reversed both FIFO batches to restore the baseline balances (so later scenarios still match the guide numbers).\n"
"- Reasons used:\n"
"  - `Issue77 FIFO acceptance reversal`\n"
"  - `Issue77 FIFO acceptance reversal (opening credit)`\n"
"- Observed after reversals:\n"
"  - Outstanding: NGN 7,000\n"
"  - Unadjusted credits: NGN 4,000\n"
"  - Net balance: NGN 3,000\n"
)
if old_reversal in text:
    text = text.replace(old_reversal, new_reversal)
elif "Manual adjustment reversal (verification)" not in text:
    raise SystemExit('Could not find expected Fixture B reversal block to replace')

# 3) Update Notes/gaps + add Resume point.
text = text.replace(
    "- FIFO scenario from the guide was not fully completed in this run (UI selection became unreliable under tool-driven interaction when trying to do a multi-credit batch in FIFO mode). Core batch creation + reversal were validated.\n",
    "- Phase 2 (openings + advances + manual adjustment + FIFO + reversals) is complete with expected balances.\n",
)

if "## Resume point" not in text:
    text = text.rstrip() + "\n\n## Resume point\n\n- UI is currently in Phase 4 (Debit/Credit Notes). Page: `http://localhost:3000/finance/receipts/debit-notes` with a New debit note modal open for Fixture A (Customer I000001).\n"

path.write_text(text + ("\n" if not text.endswith("\n") else ""), encoding='utf-8')
print('Updated', path)
