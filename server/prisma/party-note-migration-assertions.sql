-- DISPOSABLE TEST DATABASE ONLY. Run before and after a party-notes migration rerun.
DO $$
BEGIN
 IF (SELECT COUNT(*) FROM "PartyNote" WHERE id IN ('a7700000-0000-0000-0000-000000000005','a7700000-0000-0000-0000-000000000006'))<>2 THEN RAISE EXCEPTION 'Note headers changed'; END IF;
 IF (SELECT "remainingAmount" FROM "PartyNote" WHERE id='a7700000-0000-0000-0000-000000000005')<>60 THEN RAISE EXCEPTION 'Debit balance changed'; END IF;
 IF (SELECT "remainingAmount" FROM "PartyNote" WHERE id='a7700000-0000-0000-0000-000000000006')<>20 THEN RAISE EXCEPTION 'Credit balance changed'; END IF;
 IF (SELECT narration FROM "PartyNoteReceiptLine" WHERE id='a7700000-0000-0000-0000-000000000007')<>'Retained receipt snapshot' THEN RAISE EXCEPTION 'Receipt snapshot changed'; END IF;
 IF (SELECT narration FROM "PartyNoteAccountLine" WHERE id='a7700000-0000-0000-0000-000000000008')<>'Retained account snapshot' THEN RAISE EXCEPTION 'Account snapshot changed'; END IF;
 IF (SELECT "creditBalance" FROM "Customer" WHERE id='a7700000-0000-0000-0000-000000000002')<>120 THEN RAISE EXCEPTION 'Derived wallet changed'; END IF;
 IF (SELECT COUNT(*) FROM "Permission" WHERE name IN ('debitnote:read','debitnote:create','debitnote:cancel','creditnote:read','creditnote:create','creditnote:cancel','report:debit-note-register','report:credit-note-register'))<>8 THEN RAISE EXCEPTION 'Note permission seed differs'; END IF;
END $$;
