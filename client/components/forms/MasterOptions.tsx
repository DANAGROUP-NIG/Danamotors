"use client";

import { useMasterCodes } from "@/hooks/use-master-codes";

/**
 * Suggestions for a free-text input from a workshop master list (UOM, STATE, SALUTATION...).
 * Pair with `<input list={id}>`. `value` picks what is typed into the input: the code or the name.
 */
export function MasterOptions({ id, kind, extra = [], value = "code" }: {
  id: string;
  kind: string;
  extra?: string[];
  value?: "code" | "description";
}) {
  const { data } = useMasterCodes(kind);
  const options = new Map<string, string>(extra.map((option) => [option, ""]));
  for (const master of data ?? [])
    options.set(master[value], value === "code" ? master.description : master.code);
  return (
    <datalist id={id}>
      {[...options.entries()].map(([option, hint]) => (
        <option key={option} value={option}>{hint}</option>
      ))}
    </datalist>
  );
}
