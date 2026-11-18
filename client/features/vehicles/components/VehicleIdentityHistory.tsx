"use client";

import { useQuery } from "@tanstack/react-query";
import { Fingerprint } from "lucide-react";
import { apiGet } from "@/lib/api/apiClient";
import { SectionCard, tdCls, thCls } from "@/features/warranty/components/ui";

/** Mirrors identityHistory() in server/src/modules/vehicle/vehicle-identity.ts. */
type IdentityEntry = {
  id: string;
  at: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  by: string;
  changes: { field: string; old: unknown; new: unknown }[];
  reason: string | null;
};

const LABELS: Record<string, string> = {
  vin: "VIN",
  registrationNumber: "Registration",
  engineNumber: "Engine number",
  saleDate: "Sale date",
  year: "Year",
  catalogueId: "Catalogue variant",
  modelId: "Catalogue model",
  generationId: "Generation",
  engineId: "Engine",
  customMake: "Make (custom)",
  customModel: "Model (custom)",
  vehicleModelId: "Warranty model",
  make: "Make",
  model: "Model",
  trim: "Trim",
};
/** Record ids are not useful to read; the resolved make, model and trim beside them are. */
const ID_FIELDS = new Set(["catalogueId", "modelId", "generationId", "engineId", "vehicleModelId"]);

function show(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "saleDate") return new Date(String(value)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  if (ID_FIELDS.has(field)) return "changed";
  return String(value);
}

/**
 * Every change to the vehicle's VIN, registration, engine number, model and sale date, who made it and why.
 * Replaces legacy's shared "vehicle updation password", which recorded nobody.
 */
export function VehicleIdentityHistory({ vehicleId }: { vehicleId: string }) {
  const query = useQuery({
    queryKey: ["vehicles", "detail", vehicleId, "identity-history"],
    queryFn: () => apiGet<{ history: IdentityEntry[] }>(`/vehicles/${vehicleId}/identity-history`),
  });
  const entries = [...(query.data?.history ?? [])].reverse();

  return (
    <SectionCard icon={<Fingerprint />} title="Identity history" note="VIN, registration, engine number, model and sale date: every change, who made it and why.">
      {query.isLoading ? (
        <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
      ) : query.isError ? (
        <p className="py-4 text-sm text-red-600">Could not load the identity history.</p>
      ) : entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">No identity changes recorded.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50/60">
              <tr>
                <th className={thCls}>When</th>
                <th className={thCls}>By</th>
                <th className={thCls}>Change</th>
                <th className={thCls}>Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className={`${tdCls} whitespace-nowrap`}>{new Date(e.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className={tdCls}>{e.by}</td>
                  <td className={tdCls}>
                    {e.action === "INSERT" ? (
                      <span>
                        Created:{" "}
                        {e.changes.filter((c) => !ID_FIELDS.has(c.field)).map((c) => `${LABELS[c.field] ?? c.field} ${show(c.field, c.new)}`).join(" · ")}
                      </span>
                    ) : (
                      <ul className="grid gap-0.5">
                        {e.changes.map((c) => (
                          <li key={c.field}>
                            <span className="text-slate-500">{LABELS[c.field] ?? c.field}:</span>{" "}
                            {ID_FIELDS.has(c.field) ? "changed" : (
                              <>
                                <span className="line-through decoration-slate-300">{show(c.field, c.old)}</span> → <span className="font-medium">{show(c.field, c.new)}</span>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className={tdCls}>{e.reason ?? <span className="text-slate-400">{e.action === "INSERT" ? "" : "Not recorded"}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
