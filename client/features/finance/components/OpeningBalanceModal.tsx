"use client";
import { useState } from 'react';
import ModalFame from '@/components/modals/ModalFame';
import { Field,inputCls } from '@/components/forms/FormField';
import { Button } from '@/components/ui/button';
import { usePartyMutations } from '../hooks/use-party-account';
import { amountCents } from './party-adjustment-workspace';

export function OpeningBalanceModal({ customerId,branchId,onClose }: { customerId: string; branchId: string; onClose: ()=>void }) {
  const [direction,setDirection] = useState<'DEBIT'|'CREDIT'>('DEBIT');
  const [amount,setAmount] = useState('');
  const [date,setDate] = useState(()=>new Date().toLocaleDateString('en-CA'));
  const [narration,setNarration] = useState('');
  const [idempotencyKey] = useState(()=>crypto.randomUUID());
  const { opening } = usePartyMutations(customerId);
  const cents = amountCents(amount);
  const valid = cents !== null && cents > 0 && !!date && !!narration.trim();
  return <ModalFame isOpen onClose={()=>{if(!opening.isPending)onClose();}} title="Opening balance" description="Record the balance brought forward for this party."><form className="grid gap-4" onSubmit={event=>{event.preventDefault();if(!valid||opening.isPending)return;opening.mutate({ customerId,branchId,direction,amount: cents/100,date: date+'T00:00:00.000Z',narration: narration.trim(),idempotencyKey },{ onSuccess: onClose });}}>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Balance type"><select disabled={opening.isPending} className={inputCls} value={direction} onChange={event=>setDirection(event.target.value as typeof direction)}><option value="DEBIT">Debit — party owes us</option><option value="CREDIT">Credit — available to the party</option></select></Field><Field label="Opening date"><input type="date" required max={new Date().toLocaleDateString('en-CA')} disabled={opening.isPending} className={inputCls} value={date} onChange={event=>setDate(event.target.value)} /></Field></div>
    <Field label="Amount (NGN)" error={amount&&(!cents||cents<=0)?'Enter a positive amount with at most two decimal places.':undefined}><input inputMode="decimal" required disabled={opening.isPending} className={inputCls} value={amount} onChange={event=>setAmount(event.target.value)} /></Field>
    <Field label="Narration"><textarea required maxLength={2000} disabled={opening.isPending} className={inputCls+' h-24 py-2'} value={narration} onChange={event=>setNarration(event.target.value)} /></Field>
    <p className="text-sm text-muted-foreground">Opening balances are excluded from Tally posting because Tally already holds the brought-forward balance.</p>
    <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background pt-4"><Button type="button" variant="outline" disabled={opening.isPending} onClick={onClose}>Cancel</Button><Button type="submit" disabled={!valid||opening.isPending}>{opening.isPending?'Saving...':'Record opening'}</Button></div>
  </form></ModalFame>;
}
