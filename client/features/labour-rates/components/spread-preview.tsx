import type { SpreadResult } from "../api";

/** The preview of adding or copying rates across models. */
export function SpreadPreview({ result, overwrite }: { result: SpreadResult; overwrite: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm" aria-live="polite">
      <ul className="grid gap-0.5">
        <li><span className="font-medium">{result.create.toLocaleString()}</span> new rates will be added</li>
        {overwrite && <li><span className="font-medium">{result.update.toLocaleString()}</span> existing rates will be replaced</li>}
        {result.keep > 0 && (
          <li className="text-slate-500">
            {result.keep.toLocaleString()} existing rates stay as they are{overwrite ? " (already the same)" : ""}
          </li>
        )}
      </ul>
      {result.create + result.update > 5000 && <p className="mt-2 text-slate-500">A change this size can take up to a minute.</p>}
    </div>
  );
}
