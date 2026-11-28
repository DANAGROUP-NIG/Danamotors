import { gatePassRows, printedLine } from "../../lib/job-print.logic";
import type { GatePassPrintData } from "../../types/job-print.types";
import { Letterhead } from "./PrintParts";

/** The A6 gate pass the security post keeps when the vehicle leaves. Presentational only. */
export function GatePassSlip({ data }: { data: GatePassPrintData }) {
  const rows = gatePassRows(data);
  const strong = new Set(["Gate pass number", "Registration (plate)"]);
  return (
    <article aria-label="Gate pass" className="gate-pass mx-auto w-full max-w-sm space-y-3 border border-border bg-card p-4 text-foreground shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
      <Letterhead company={data.company.name} branch={data.branch.name} />
      <h1 className="bg-primary py-1 text-center text-xl font-bold text-primary-foreground">Gate pass</h1>
      <table className="w-full border border-foreground/40 text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-foreground/40 last:border-b-0">
              <th scope="row" className="w-2/5 border-r border-foreground/40 px-2 py-1 text-left font-medium">{row.label}</th>
              <td className={strong.has(row.label) ? "px-2 py-1 text-base font-bold" : "px-2 py-1"}>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border border-foreground/40 px-2 pb-2 pt-6 text-sm">
        <div className="flex items-end gap-2">
          <span>Security signature:</span>
          <span className="h-6 flex-1 border-b border-foreground/60" aria-label="Signature line" />
        </div>
        <div className="mt-4 flex items-end gap-2">
          <span>Time out:</span>
          <span className="h-6 flex-1 border-b border-foreground/60" aria-label="Time line" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{printedLine(data.printedAt)}</p>
    </article>
  );
}
