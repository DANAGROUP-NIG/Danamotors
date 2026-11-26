"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lagosDate } from "@/features/service-transactions/transaction.logic";
import { fmtDate } from "@/features/reports/lib/report-format";
import type { CsiQuestionnaire } from "../hooks/use-csi-issuance";

export function CsiQuestionnairePrint({
  surveys,
  onClose,
}: {
  surveys: CsiQuestionnaire[];
  onClose: () => void;
}) {
  return (
    <section aria-label="CSI questionnaire preview" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="font-semibold">Questionnaires ready</h2>
          <p className="text-sm text-muted-foreground">
            Print one questionnaire per job. To export a file, choose Save as
            PDF in the print dialog.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Close preview
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="size-4" />
            Print questionnaires
          </Button>
        </div>
      </div>
      <div id="csi-questionnaires" className="space-y-5">
        <style>{`@media print { @page { size: A4; margin: 12mm; } body * { visibility: hidden; } #csi-questionnaires, #csi-questionnaires * { visibility: visible; } #csi-questionnaires { position: absolute; top: 0; left: 0; width: 100%; } #csi-questionnaires article { break-after: page; border: 0; border-radius: 0; } #csi-questionnaires article:last-child { break-after: auto; } #csi-questionnaires tr, #csi-questionnaires footer, #csi-questionnaires .response-signoff { break-inside: avoid; } #csi-questionnaires thead { display: table-header-group; } }`}</style>
        {surveys.map((survey) => {
          const job = survey.jobSnapshot;
          return (
            <article
              key={survey.id}
              className="space-y-4 rounded-lg border border-border bg-background p-4 text-foreground sm:p-6 print:space-y-2 print:p-0"
            >
              <header className="flex flex-wrap justify-between gap-3 border-b border-border pb-3">
                <div>
                  <h2 className="text-lg font-semibold print:text-base">
                    Customer satisfaction questionnaire
                  </h2>
                  <p className="text-sm print:text-xs">{job.branch}</p>
                </div>
                <div className="text-sm print:text-xs">
                  <p>
                    {survey.revision.code}, version {survey.revision.version}
                  </p>
                  <p>{survey.revision.description}</p>
                </div>
              </header>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 print:grid-cols-3 print:gap-y-1 print:text-xs">
                {[
                  ["Job number", job.jobNumber],
                  ["Job date", fmtDate(job.jobDate)],
                  ["Customer", job.customer],
                  ["Registration", job.registration],
                  ["Model", job.model],
                  ["Variant", job.variant],
                  [
                    "Mileage",
                    job.mileage === null
                      ? null
                      : new Intl.NumberFormat("en-NG").format(job.mileage),
                  ],
                  ["Service", job.service],
                  ["Mobile", job.mobile],
                  ["Address", job.address],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="break-words">{value || "Not provided"}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm print:text-xs">
                Please select one response for each question. Your feedback
                helps us improve workshop service.
              </p>
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-sm print:text-xs print:leading-tight">
                  <thead>
                    <tr className="border-y border-border">
                      <th scope="col" className="p-2 text-left print:p-1">
                        Question
                      </th>
                      {survey.revision.responses.map((response) => (
                        <th
                          key={response.responseId}
                          scope="col"
                          className="p-2 text-center font-medium print:p-1"
                        >
                          {response.description}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {survey.revision.attributes.map((attribute) => (
                      <tr
                        key={attribute.attributeId}
                        className="border-b border-border"
                      >
                        <th scope="row" className="p-2 text-left font-normal print:p-1">
                          {attribute.description}
                        </th>
                        {survey.revision.responses.map((response) => (
                          <td
                            key={response.responseId}
                            className="p-2 text-center print:p-1"
                          >
                            <span
                              aria-label={`${response.description} response space for ${attribute.description}`}
                              className="mx-auto block size-4 rounded-sm border border-foreground print:size-3"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="response-signoff space-y-3 print:space-y-2">
                <h3 className="text-sm font-medium">
                  Comments and suggestions
                </h3>
                <div className="h-16 border-b border-border print:h-8" />
                <div className="grid gap-6 text-sm sm:grid-cols-2 print:grid-cols-2">
                  <p className="border-b border-border pb-6 print:pb-4">
                    Customer signature
                  </p>
                  <p className="border-b border-border pb-6 print:pb-4">Response date</p>
                </div>
              </div>
              <footer className="break-words text-xs text-muted-foreground">
                Questionnaire for job {job.jobNumber}. Generated{" "}
                {lagosDate(survey.generatedAt)}. Reprints retain the original
                job details and questionnaire version.
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
