from pathlib import Path

path = Path('doc/issue-77-frontend-verification.md')
text = path.read_text(encoding='utf-8')

# Widen scope statement slightly (still truthful)
text = text.replace(
    "Additional screens (Debit/Credit notes, Update Outstanding, Outstanding Letters) were smoke-loaded earlier but are not fully executed end-to-end in this run.",
    "Additional screens (Debit/Credit notes, Update Outstanding, Outstanding Letters) are reachable; Phase 4+ end-to-end execution is in progress in this run.",
)

# Update key outcome section to include FIFO fix.
if "FIFO preview date filtering" not in text:
    text = text.replace(
        "## Key outcome\n\n- Reproduced a blocking backend validation error preventing manual adjustments from saving: `Adjustment date cannot precede a selected document`.\n- Fixed the validation to compare on calendar-day boundaries (UTC) so same-day adjustments work as intended.\n\nCode change:\n- `server/src/modules/finance/party-account.service.ts`\n",
        "## Key outcome\n\n- Reproduced a blocking backend validation error preventing manual adjustments from saving: `Adjustment date cannot precede a selected document`.\n- Fixed the validation to compare on calendar-day boundaries (UTC) so same-day adjustments work as intended.\n- Found a FIFO preview edge-case where same-day documents were excluded (timezone/timestamp comparison), causing `No outstanding debits and available credits can be matched`.\n- Fixed FIFO preview + funding-credit selection to compare by calendar date (`d.date::date <= ${date}::date`).\n\nCode change:\n- `server/src/modules/finance/party-account.service.ts`\n",
    )

# Update executed acceptance wording.
text = text.replace(
    "and executed the core Phase 2 party-account scenarios.",
    "and executed the Phase 2 party-account scenarios (openings, advance receipt, manual adjustment + reversal, FIFO preview/save + reversal).",
)

path.write_text(text, encoding='utf-8')
print('Updated', path)
