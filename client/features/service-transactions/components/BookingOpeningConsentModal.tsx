"use client";
import { useEffect, useRef, useState } from 'react';
import ModalFame from '@/components/modals/ModalFame';
import { Button } from '@/components/ui/button';
import { useBookingOpeningConsent } from '../hooks/use-booking-opening-consent';
import { openingTermsReachedEnd, type OpeningConsentDocument, type OpeningConsentProof } from '../booking-opening-consent.logic';

type Props = { isOpen: boolean; appointmentId: string; onClose: () => void; onAccept: (consent: OpeningConsentProof) => void };
export function BookingOpeningConsentModal({ isOpen, ...props }: Props) {
  return isOpen ? <ConsentSession key={props.appointmentId} {...props} /> : null;
}

function ConsentSession({ appointmentId, onClose, onAccept }: Omit<Props, 'isOpen'>) {
  const query = useBookingOpeningConsent(appointmentId);
  return <ModalFame isOpen onClose={onClose} title="Consent to open a job card" description="Review the job card terms before opening the workshop record.">
    {query.isPending ? <p role="status">Loading job card terms…</p> : query.isError ? <div role="alert" className="space-y-3"><p>Could not load the terms. Consent cannot be given until they are available.</p><Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></div> : <ConsentContent key={query.data.consent.termsHash} consent={query.data.consent} onAccept={onAccept} onClose={onClose} />}
  </ModalFame>;
}

function ConsentContent({ consent, onAccept, onClose }: { consent: OpeningConsentDocument; onAccept: Props['onAccept']; onClose: Props['onClose'] }) {
  const region = useRef<HTMLDivElement>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [accepted, setAccepted] = useState(false);
  useEffect(() => {
    if (region.current && openingTermsReachedEnd(region.current)) setReachedEnd(true);
  }, []);
  return <div className="space-y-4">
    <div ref={region} role="region" aria-label="Job card opening terms and conditions" tabIndex={0} className="max-h-64 space-y-4 overflow-y-auto rounded-lg border border-border p-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onScroll={event => {
      if (openingTermsReachedEnd(event.currentTarget)) setReachedEnd(true);
    }}>
      <p>{consent.statement}</p>
      {!!consent.terms.length && <ol className="list-decimal space-y-3 pl-5">{consent.terms.map((term, index) => <li key={index} className="whitespace-pre-wrap">{term}</li>)}</ol>}
      {consent.footer && <p className="whitespace-pre-wrap">{consent.footer}</p>}
    </div>
    {!reachedEnd && <p role="status" className="text-sm text-muted-foreground">Scroll to the bottom of the terms to show the consent checkbox.</p>}
    {reachedEnd && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />I give consent for a job card to be opened for this appointment under the terms above.</label>}
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" disabled={!reachedEnd || !accepted} onClick={() => onAccept({ accepted: true, termsHash: consent.termsHash })}>Continue to job card</Button></div>
  </div>;
}
