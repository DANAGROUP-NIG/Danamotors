import { CarDiagram } from "../check-in/CarDiagram";
import { DAMAGE_TYPES, DAMAGE_VIEW, damageLine } from "../../lib/check-in.logic";
import {
  branchLine,
  checklistMark,
  comparisonRows,
  customerRows,
  fuelView,
  headlineRows,
  printedLine,
  signatureViews,
  signedLine,
  vehicleRows,
  visitLines,
} from "../../lib/job-print.logic";
import type { JobCardPrintData } from "../../types/job-print.types";
import { FieldList, Letterhead, PrintSection, SignatureBox, TickBox } from "./PrintParts";

const noop = () => undefined;

/** A fuel gauge drawn as an outline, needle at the recorded level. No needle when the level was not recorded. */
function FuelGauge({ angle, label }: { angle: number | null; label: string }) {
  const radians = ((angle ?? 0) - 90) * (Math.PI / 180);
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 120 72" className="h-auto w-full max-w-36" role="img" aria-label={`Fuel level: ${label}`}>
        <path d="M12 64 A48 48 0 0 1 108 64" className="fill-none stroke-foreground/70" strokeWidth={3} />
        {[-90, -45, 0, 45, 90].map((tick) => {
          const r = ((tick - 90) * Math.PI) / 180;
          return (
            <line
              key={tick}
              x1={60 + 40 * Math.cos(r)}
              y1={64 + 40 * Math.sin(r)}
              x2={60 + 48 * Math.cos(r)}
              y2={64 + 48 * Math.sin(r)}
              className="stroke-foreground/70"
              strokeWidth={2}
            />
          );
        })}
        <text x={8} y={70} className="fill-foreground text-xs font-semibold">E</text>
        <text x={104} y={70} className="fill-foreground text-xs font-semibold">F</text>
        <text x={60} y={10} textAnchor="middle" className="fill-muted-foreground text-xs">1/2</text>
        {angle !== null && (
          <line x1={60} y1={64} x2={60 + 38 * Math.cos(radians)} y2={64 + 38 * Math.sin(radians)} className="stroke-primary" strokeWidth={3} strokeLinecap="round" />
        )}
        <circle cx={60} cy={64} r={4} className="fill-primary" />
      </svg>
      <figcaption className="font-medium">{label}</figcaption>
    </figure>
  );
}

/**
 * The job card as printed: page 1 is the paper form filled from the stored job, page 2 the
 * numbered JOB_CARD terms. Presentational only; the route page loads the data and prints.
 */
export function JobCardPrint({ data }: { data: JobCardPrintData }) {
  const fuel = fuelView(data.fuelLevel);
  const confirmed = signedLine("Confirmed by", data.findingsConfirmed);
  const roadworthy = signedLine("Checked and certified roadworthy by", data.roadworthy);
  const branch = branchLine(data.branch);
  return (
    <div className="space-y-6 print:space-y-0">
      {/* Page 1: the front of the paper job card. */}
      <article aria-label="Job card, front" className="job-sheet space-y-2 border border-border bg-card p-4 text-foreground shadow-sm print:border-0 print:p-0 print:shadow-none">
        <Letterhead company={data.company.name} branch={branch}>
          <div className="flex items-center gap-4">
            <h1 className="whitespace-nowrap text-2xl font-bold text-primary">Job card</h1>
            <div className="flex items-center gap-3 border border-foreground/40 px-2 py-1 text-xs font-medium">
              <span className="flex items-center gap-1">
                Warranty <TickBox ticked={data.job.warranty} label={data.job.warranty ? "Warranty, ticked" : "Warranty, not ticked"} />
              </span>
              <span className="flex items-center gap-1">
                Non-warranty <TickBox ticked={!data.job.warranty} label={data.job.warranty ? "Non-warranty, not ticked" : "Non-warranty, ticked"} />
              </span>
            </div>
          </div>
        </Letterhead>

        <dl className="print-keep grid grid-cols-2 border border-foreground/40 text-xs sm:grid-cols-4 print:grid-cols-4">
          {headlineRows(data).map((row) => (
            <div key={row.label} className="border-foreground/40 px-2 py-1 text-center even:border-l sm:border-l sm:first:border-l-0 print:border-l print:first:border-l-0">
              <dt className="font-semibold">{row.label}</dt>
              <dd className="tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-2 md:grid-cols-[2fr_3fr] print:grid-cols-[2fr_3fr]">
          <PrintSection title="Customer details">
            <FieldList rows={customerRows(data)} />
          </PrintSection>
          <PrintSection title="Vehicle details">
            <FieldList rows={vehicleRows(data)} className="sm:grid-cols-[auto_1fr_auto_1fr] print:grid-cols-[auto_1fr_auto_1fr]" />
          </PrintSection>
        </div>

        <div className="grid gap-2 md:grid-cols-2 print:grid-cols-2">
          <PrintSection title="Customer requests" hint="in the customer's words">
            {data.requests.length ? (
              <ol className="list-decimal space-y-0.5 pl-4">
                {data.requests.map((request, index) => (
                  <li key={index} className="break-words">{request}</li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground">No requests recorded.</p>
            )}
          </PrintSection>
          <PrintSection title="Instructions to technician">
            {data.instructions.advisor.length || data.instructions.supervisor.length ? (
              <ul className="list-disc space-y-0.5 pl-4">
                {data.instructions.advisor.map((line, index) => (
                  <li key={`a${index}`} className="break-words">{line}</li>
                ))}
                {data.instructions.supervisor.map((line, index) => (
                  <li key={`s${index}`} className="break-words">
                    <span className="font-medium">Supervisor: </span>
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No instructions recorded.</p>
            )}
          </PrintSection>
        </div>

        <div className="grid gap-2 md:grid-cols-[3fr_2fr] print:grid-cols-[3fr_2fr]">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="grid gap-2 sm:grid-cols-[3fr_2fr] print:grid-cols-[3fr_2fr]">
              <PrintSection title="Body and paint damage" hint={DAMAGE_TYPES.map((type) => `${DAMAGE_VIEW[type].letter} = ${DAMAGE_VIEW[type].label}`).join(", ")}>
                <div className="flex items-start gap-2">
                  <div className="w-24 shrink-0">
                    <CarDiagram marks={data.damageMarks} draft={null} editable={false} onTap={noop} onMoveDraft={noop} tone="print" />
                  </div>
                  {data.damageMarks.length ? (
                    <ul className="min-w-0 space-y-0.5">
                      {data.damageMarks.map((mark) => (
                        <li key={mark.id} className="break-words">
                          <span className="font-semibold">{DAMAGE_VIEW[mark.type].letter}</span> {damageLine(mark)}
                          {mark.note ? `: ${mark.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">No damage noted.</p>
                  )}
                </div>
              </PrintSection>
              <PrintSection title="Fuel level">
                <FuelGauge angle={fuel.angle} label={fuel.label} />
              </PrintSection>
            </div>
            <PrintSection title="Cause and nature of defect" hint="diagnosis">
              {data.findings.length ? (
                <ul className="list-disc space-y-0.5 pl-4">
                  {data.findings.map((finding, index) => (
                    <li key={index} className="break-words">
                      {finding.text} <span className="text-muted-foreground">({finding.source})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No findings recorded.</p>
              )}
              {(confirmed || roadworthy) && (
                <div className="mt-1 space-y-0.5 text-muted-foreground">
                  {confirmed && <p>{confirmed}</p>}
                  {roadworthy && <p>{roadworthy}</p>}
                </div>
              )}
            </PrintSection>
            <PrintSection title="Estimated and actual">
              <table className="w-full text-xs">
                <caption className="sr-only">Estimated and actual, customer amounts before VAT</caption>
                <thead>
                  <tr className="border-b border-foreground/40">
                    <th scope="col" className="py-0.5 text-left font-semibold">Item</th>
                    <th scope="col" className="py-0.5 text-right font-semibold">Estimated</th>
                    <th scope="col" className="py-0.5 text-right font-semibold">Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows(data).map((row) => (
                    <tr key={row.label} className={row.total ? "border-t border-foreground/60 font-bold" : undefined}>
                      <th scope="row" className="py-0.5 text-left font-medium">{row.label}</th>
                      <td className="py-0.5 text-right tabular-nums">{row.estimated}</td>
                      <td className="py-0.5 text-right tabular-nums">{row.actual}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-muted-foreground">Amounts the customer pays, before VAT and discounts.</p>
            </PrintSection>
          </div>
          <PrintSection title="Service checklist" hint={`${data.checklist.length} items`}>
            <ol className="space-y-0.5">
              {data.checklist.map((item) => {
                const mark = checklistMark(item.state);
                return (
                  <li key={item.code} className="flex items-center gap-1.5">
                    <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{item.number}.</span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {mark.word && <span className="font-medium">{mark.word}</span>}
                    <TickBox ticked={mark.ticked} label={mark.ticked ? `${item.label}, present` : mark.word ? `${item.label}, ${mark.word.toLowerCase()}` : `${item.label}, not checked`} />
                  </li>
                );
              })}
            </ol>
            {data.checklistNote && <p className="mt-1 break-words text-muted-foreground">Note: {data.checklistNote}</p>}
          </PrintSection>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 print:grid-cols-5">
          {signatureViews(data).map((box) => (
            <SignatureBox key={box.key} box={box} />
          ))}
        </div>

        <section aria-label="Vehicle history" className="print-keep flex border border-foreground/40 text-xs">
          <h2 className="flex w-20 shrink-0 items-center bg-primary px-2 py-1 font-semibold text-primary-foreground">Vehicle history</h2>
          <dl className="min-w-0 flex-1 space-y-0.5 px-2 py-1">
            {visitLines(data).map((visit) => (
              <div key={visit.label} className="flex flex-wrap gap-x-2">
                <dt className="font-semibold">{visit.label}:</dt>
                <dd className="min-w-0 break-words">{visit.text}</dd>
              </div>
            ))}
          </dl>
        </section>
        <p className="text-xs text-muted-foreground">{printedLine(data.printedAt)}</p>
      </article>

      {/* Page 2: the back of the paper job card. */}
      <article aria-label="Job card, back" className="job-sheet job-back space-y-3 border border-border bg-card p-4 text-foreground shadow-sm print:border-0 print:p-0 print:shadow-none">
        <Letterhead company={data.company.name} branch={branch}>
          <p className="text-sm font-medium">Job {data.job.number}</p>
        </Letterhead>
        <h2 className="bg-primary px-3 py-1.5 text-center text-lg font-bold text-primary-foreground">Terms and conditions</h2>
        {data.terms.length ? (
          <ol className="space-y-2 text-sm print:space-y-1.5 print:text-xs">
            {data.terms.map((term) => (
              <li key={term.number} className="print-keep flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center bg-primary text-xs font-bold text-primary-foreground tabular-nums">{term.number}</span>
                <p className="min-w-0 flex-1 whitespace-pre-line break-words">{term.text}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm">No job card terms are set for this branch. An administrator adds them in Settings, Terms and Conditions, document Job card.</p>
        )}
        {data.termsFooter && <p className="text-xs text-muted-foreground">{data.termsFooter}</p>}
      </article>
    </div>
  );
}
