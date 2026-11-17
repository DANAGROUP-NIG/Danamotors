import { lagosDate } from "@/features/service-transactions/transaction.logic";
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
          <dd>{scope.registration || "N/A"}</dd>
        </div>
        <div>
          <dt className="font-medium">VIN</dt>
          <dd className="break-all">{scope.vin || "N/A"}</dd>
        </div>
        <div>
          <dt className="font-medium">Mileage</dt>
          <dd>
            {scope.mileage === null
              ? "N/A"
              : scope.mileage.toLocaleString("en-NG")}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Opened</dt>
          <dd>{lagosDate(scope.openedAt)}</dd>
        </div>
        <div>
          <dt className="font-medium">Promised delivery</dt>
          <dd>
            {scope.promisedAt ? lagosDate(scope.promisedAt) : "Not provided"}
          </dd>
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
