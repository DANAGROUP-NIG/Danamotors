"use client";
import type { ReactNode } from "react";

export interface PrintSheetProps {
  title: string;
  number: string;
  date: string;
  branch?: string;
  meta: [string, ReactNode][];
  columns: string[];
  rows: ReactNode[][];
  totals?: [string, ReactNode][];
  footnote?: ReactNode;
  signatures?: string[];
}

/** A plain A4 document for the browser print dialog; shown only when printing. */
export function PdiPrintSheet({ title, number, date, branch, meta, columns, rows, totals, footnote, signatures = ["Prepared by", "Received by"] }: PrintSheetProps) {
  return (
    <article className="mx-auto max-w-[210mm] bg-white p-8 text-[12px] text-black">
      <header className="flex items-start justify-between border-b-2 border-black pb-3">
        <div>
          <p className="text-lg font-bold tracking-wide">DANA MOTORS</p>
          {branch && <p>{branch}</p>}
        </div>
        <div className="text-right">
          <p className="text-base font-bold uppercase">{title}</p>
          <p className="font-mono">{number}</p>
          <p>{date}</p>
        </div>
      </header>
      <dl className="grid grid-cols-3 gap-x-6 gap-y-1 py-3">
        {meta.map(([label, value]) => (
          <div key={label}><dt className="text-[10px] uppercase text-gray-600">{label}</dt><dd className="font-medium">{value ?? "—"}</dd></div>
        ))}
      </dl>
      <table className="w-full border-collapse">
        <thead>
          <tr>{columns.map(column => <th key={column} className="border border-black px-2 py-1 text-left">{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border border-black px-2 py-1 align-top">{cell}</td>)}</tr>
          )) : <tr><td colSpan={columns.length} className="border border-black px-2 py-3 text-center">No lines</td></tr>}
        </tbody>
      </table>
      {totals && (
        <dl className="ml-auto mt-3 w-72 space-y-1">
          {totals.map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt>{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}
        </dl>
      )}
      {footnote && <p className="mt-4 text-[11px]">{footnote}</p>}
      <footer className="mt-16 grid grid-cols-3 gap-6">
        {signatures.map(label => <p key={label} className="border-t border-black pt-1 text-center">{label}</p>)}
      </footer>
    </article>
  );
}
