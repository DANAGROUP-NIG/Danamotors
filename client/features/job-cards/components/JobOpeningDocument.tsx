import { formatDateTime, formatKm, NOT_PROVIDED } from "@/lib/format";
import { CHECKLIST_STATE_VIEW, belongingsText, damageLine, fuelLabel } from "../lib/check-in.logic";
import type { SignedOpeningDocument } from "../types/job-opening-consent.types";

/** The same saved customer-facing scope is reviewed before signing and printed afterwards. */
export function JobOpeningDocument({
  document,
}: {
  document: SignedOpeningDocument;
}) {
  const { scope } = document;
  return (
    <div className="space-y-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium">Job card</dt>
          <dd>{scope.jobNumber}</dd>
        </div>
        <div>
          <dt className="font-medium">Branch</dt>
          <dd>{scope.branchName}</dd>
        </div>
        <div>
          <dt className="font-medium">Customer</dt>
          <dd className="wrap-break-word">{scope.customerName}</dd>
        </div>
        <div>
          <dt className="font-medium">Registration</dt>
          <dd>{scope.registration || NOT_PROVIDED}</dd>
        </div>
        <div>
          <dt className="font-medium">VIN</dt>
          <dd className="break-all">{scope.vin || NOT_PROVIDED}</dd>
        </div>
        <div>
          <dt className="font-medium">Mileage</dt>
          <dd>{formatKm(scope.mileage)}</dd>
        </div>
        <div>
          <dt className="font-medium">Opened</dt>
          <dd>{formatDateTime(scope.openedAt)}</dd>
        </div>
        <div>
          <dt className="font-medium">Promised delivery</dt>
          <dd>{formatDateTime(scope.promisedAt)}</dd>
        </div>
        <div>
          <dt className="font-medium">Service</dt>
          <dd>{scope.service}</dd>
        </div>
      </dl>
      {scope.description && (
        <p className="whitespace-pre-wrap wrap-break-word text-sm">
          {scope.description}
        </p>
      )}
      <section className="space-y-2">
        <h3 className="font-semibold">Customer requests</h3>
        {scope.requests.length ? (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {scope.requests.map((row) => (
              <li key={row.id} className="whitespace-pre-wrap wrap-break-word">
                {row.description}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            No customer requests recorded.
          </p>
        )}
      </section>
      {document.version === 2 && <SignedWalkAround checkIn={document.scope.checkIn} />}
      <section className="space-y-2 text-sm">
        <h3 className="font-semibold">Job-opening consent</h3>
        <p>{document.statement}</p>
        {!!document.terms.length && (
          <ol className="list-decimal space-y-2 pl-5">
            {document.terms.map((term, index) => (
              <li key={index} className="whitespace-pre-wrap wrap-break-word">
                {term}
              </li>
            ))}
          </ol>
        )}
        {document.footer && (
          <p className="whitespace-pre-wrap wrap-break-word">
            {document.footer}
          </p>
        )}
      </section>
    </div>
  );
}

type SignedCheckIn = Extract<SignedOpeningDocument, { version: 2 }>["scope"]["checkIn"];

/** The walk-around the customer confirmed (signed documents from phase 2 on). */
function SignedWalkAround({ checkIn }: { checkIn: SignedCheckIn }) {
  return (
    <section className="space-y-3 text-sm" style={{ breakInside: "avoid" }}>
      <h3 className="font-semibold">Vehicle condition at check-in</h3>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="font-medium">Fuel level</dt>
          <dd>{fuelLabel(checkIn.fuelLevel)}</dd>
        </div>
        <div>
          <dt className="font-medium">Service book</dt>
          <dd>
            {checkIn.serviceBookSeen
              ? `Seen, ${checkIn.serviceBookStamps ?? 0} stamps this warranty year`
              : "Not seen"}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Belongings</dt>
          <dd className="wrap-break-word">{belongingsText(checkIn)}</dd>
        </div>
        <div>
          <dt className="font-medium">Photos taken</dt>
          <dd>{checkIn.photos.length}</dd>
        </div>
      </dl>
      <div>
        <h4 className="font-medium">Damage noted</h4>
        {checkIn.damageMarks.length ? (
          <ul className="list-disc pl-5">
            {checkIn.damageMarks.map((mark) => (
              <li key={mark.id}>
                {damageLine(mark)}
                {mark.note ? `: ${mark.note}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p>No damage noted</p>
        )}
      </div>
      <div>
        <h4 className="font-medium">Checklist</h4>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-3 print:grid-cols-3">
          {checkIn.checklist.map((item) => (
            <li key={item.code} className="flex justify-between gap-2 border-b border-border py-0.5">
              <span>{item.label}</span>
              <span className="font-medium">{CHECKLIST_STATE_VIEW[item.state ?? "UNSET"].label}</span>
            </li>
          ))}
        </ul>
        {checkIn.checklistNote && <p className="mt-2 whitespace-pre-wrap wrap-break-word">Notes: {checkIn.checklistNote}</p>}
      </div>
    </section>
  );
}
