"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import type { Customer } from "../types/customer.types";
import { updateCustomerTallyLedgerRequest } from "../api/customer.api";
import { customerKeys } from "../api/customer.keys";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import { apiGet } from "@/lib/api/apiClient";
import { useAuth } from "@/features/auth/hooks/use-auth";

type TallyLedger = { id: string; code: string; name: string; active: boolean };

export function CustomerTallyLedgerCard({ customer }: { customer: Customer }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const allowed = hasPermission("customer:tally-mapping");
  const [search, setSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState(customer.tallyLedger?.code ?? "");
  const [committedSearch, setCommittedSearch] = useState("");
  const ledgers = useQuery({
    queryKey: ["tally-ledgers", committedSearch],
    queryFn: async () => {
      const query = new URLSearchParams({ search: committedSearch });
      return apiGet<{ ledgers: TallyLedger[] }>(`${API_ROUTES.finance.tally.ledgers}?${query.toString()}`);
    },
    enabled: allowed && committedSearch.length > 0,
  });
  const update = useMutation({
    mutationFn: () => updateCustomerTallyLedgerRequest(customer.id, selectedCode || null),
    onSuccess: () => {
      toast.success("Tally ledger mapping saved");
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(customer.id) });
    },
    onError: () => toast.error("Could not save Tally ledger mapping"),
  });

  if (!allowed) return null;

  return (
    <section className="grid gap-4 border-y py-4">
      <div>
        <h2 className="font-semibold text-foreground">Tally ledger</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {customer.tallyLedger ? `${customer.tallyLedger.code} - ${customer.tallyLedger.name}` : "No ledger linked"}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Field label="Find by Tally code or name">
          <div className="flex gap-2">
            <input className={inputCls} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setCommittedSearch(search.trim());
              }
            }} />
            <Button type="button" variant="outline" aria-label="Search Tally ledgers" onClick={() => setCommittedSearch(search.trim())}>
              <Search className="size-4" />
            </Button>
          </div>
        </Field>
        <Field label="Selected ledger">
          <select className={inputCls} value={selectedCode} onChange={(event) => setSelectedCode(event.target.value)}>
            <option value="">No ledger</option>
            {customer.tallyLedger && !ledgers.data?.ledgers.some((ledger) => ledger.code === customer.tallyLedger?.code) && (
              <option value={customer.tallyLedger.code}>{customer.tallyLedger.code} - {customer.tallyLedger.name}</option>
            )}
            {ledgers.data?.ledgers.map((ledger) => <option key={ledger.id} value={ledger.code}>{ledger.code} - {ledger.name}</option>)}
          </select>
        </Field>
      </div>
      {ledgers.isFetching && <p className="text-xs text-muted-foreground">Searching ledgers...</p>}
      {ledgers.isError && <p role="alert" className="text-xs text-destructive">Ledger search failed.</p>}
      {committedSearch && !ledgers.isFetching && ledgers.data?.ledgers.length === 0 && (
        <p className="text-xs text-muted-foreground">No matching Tally ledgers.</p>
      )}
      <div>
        <Button type="button" size="sm" disabled={update.isPending} onClick={() => update.mutate()}>
          <Save className="size-4" />
          {update.isPending ? "Saving..." : "Save mapping"}
        </Button>
      </div>
    </section>
  );
}