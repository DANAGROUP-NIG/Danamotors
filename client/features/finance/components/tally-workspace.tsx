"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/headers/page-header";
import { Field, inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";

type DocumentType = "JOB_BILL" | "RECEIPT";
type TallyDocument = {
  id: string;
  documentNumber: string;
  date: string;
  customerName: string;
  ready: boolean;
  reason?: string;
  total: number;
};
type Ledger = { id: string; code: string; name: string; active: boolean };
type AccountMapping = {
  documentType: DocumentType;
  accountType: string;
  tallyLedgerCode: string;
  tallyLedgerName: string;
};
type ExportBatch = {
  batchId: string;
  xml: string;
  exported: Array<{ type: DocumentType; id: string; documentNumber: string }>;
  skipped: Array<{ type: DocumentType; id: string; documentNumber?: string; reason: string }>;
};

const money = (amount: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(amount);

function parseLedgerRows(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let quoted = false;
  let commas = 0;
  let tabs = 0;
  for (let index = 0; index < firstLine.length; index += 1) {
    const character = firstLine[index];
    if (character === '"' && firstLine[index + 1] === '"' && quoted) {
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === ",") {
      commas += 1;
    } else if (!quoted && character === "\t") {
      tabs += 1;
    }
  }
  const delimiter = tabs > commas ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && source[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      row.push(value.trim());
      value = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows
    .filter((cells) => cells.length >= 2 && !["code", "ledger code"].includes(cells[0].toLowerCase()))
    .map(([code, name]) => ({ code, name }));
}

function downloadXml(batch: ExportBatch) {
  const url = URL.createObjectURL(new Blob([batch.xml], { type: "application/xml" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `tally-${batch.batchId}.xml`;
  link.click();
  URL.revokeObjectURL(url);
}

export function TallyWorkspace() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<DocumentType>("JOB_BILL");
  const [selected, setSelected] = useState<string[]>([]);
  const [batch, setBatch] = useState<ExportBatch | null>(null);
  const [voucherNumbers, setVoucherNumbers] = useState<Record<string, string>>({});
  const [ledgerImportText, setLedgerImportText] = useState("");
  const [mappingType, setMappingType] = useState<DocumentType>("JOB_BILL");
  const [accountType, setAccountType] = useState("PARTS_SALES");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [selectedLedgerCode, setSelectedLedgerCode] = useState("");

  const documents = useQuery({
    queryKey: ["tally-documents", date, type],
    queryFn: async () => {
      const query = new URLSearchParams({ date, type });
      return apiGet<{ documents: TallyDocument[] }>(`${API_ROUTES.finance.tally.documents}?${query}`);
    },
  });
  const ledgers = useQuery({
    queryKey: ["tally-ledgers", ledgerSearch],
    queryFn: async () => apiGet<{ ledgers: Ledger[] }>(`${API_ROUTES.finance.tally.ledgers}?search=${encodeURIComponent(ledgerSearch)}`),
    enabled: ledgerSearch.length > 0,
  });
  const mappings = useQuery({
    queryKey: ["tally-account-mappings"],
    queryFn: () => apiGet<{ mappings: AccountMapping[] }>(API_ROUTES.finance.tally.accountMappings),
  });
  const available = documents.data?.documents ?? [];

  function toggleAll(checked: boolean) {
    setSelected(checked ? available.map((document) => document.id) : []);
  }

  async function exportBatch() {
    try {
      const result = await apiPost<ExportBatch>(API_ROUTES.finance.tally.export, {
        documents: selected.map((id) => ({ id, type })),
      });
      setBatch(result);
      setVoucherNumbers({});
      if (result.xml) downloadXml(result);
      toast.success(`${result.exported.length} document(s) prepared for Tally import`);
      if (result.skipped.length) toast.warning(`${result.skipped.length} document(s) skipped; review the reasons below`);
      setSelected([]);
      await documents.refetch();
    } catch {
      toast.error("Could not prepare Tally XML");
    }
  }

  async function confirmPosted() {
    if (!batch) return;
    const confirmed = batch.exported.filter((document) => voucherNumbers[document.id]?.trim());
    if (confirmed.length === 0) return;
    try {
      await apiPost(API_ROUTES.finance.tally.confirm, {
        batchId: batch.batchId,
        documents: confirmed.map((document) => ({
          type: document.type,
          id: document.id,
          voucherNumber: voucherNumbers[document.id].trim(),
        })),
      });
      toast.success(`${confirmed.length} Tally posting(s) recorded`);
      setBatch(null);
      await documents.refetch();
    } catch {
      toast.error("Could not confirm Tally posting references");
    }
  }

  async function importLedgers() {
    const parsed = parseLedgerRows(ledgerImportText).filter((row) => row.code && row.name);
    if (parsed.length === 0) {
      toast.error("Paste ledger code and name rows first");
      return;
    }
    try {
      const result = await apiPost<{ imported: number; added: number; updated: number }>(API_ROUTES.finance.tally.importLedgers, { ledgers: parsed });
      toast.success(`${result.imported} imported, ${result.added} added, ${result.updated} updated`);
      setLedgerImportText("");
      await ledgers.refetch();
    } catch {
      toast.error("Ledger import failed");
    }
  }

  async function saveMapping() {
    const ledger = ledgers.data?.ledgers.find((item) => item.code === selectedLedgerCode);
    if (!ledger) {
      toast.error("Search and select an active Tally ledger first");
      return;
    }
    const next = (mappings.data?.mappings ?? []).filter((item) => !(item.documentType === mappingType && item.accountType === accountType));
    next.push({ documentType: mappingType, accountType, tallyLedgerCode: ledger.code, tallyLedgerName: ledger.name });
    try {
      await apiPut(API_ROUTES.finance.tally.accountMappings, { mappings: [next[next.length - 1]] });
      toast.success("Tally account mapping saved");
      await mappings.refetch();
    } catch {
      toast.error("Could not save account mapping");
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader title="Tally" description="Prepare voucher XML, import ledgers, and record confirmed voucher references." />

      <section className="grid gap-4 border-y py-4 md:grid-cols-[1fr_1fr_2fr]">
        <Field label="Document date">
          <input type="date" className={inputCls} value={date} onChange={(event) => { setDate(event.target.value); setSelected([]); setBatch(null); }} />
        </Field>
        <Field label="Document type">
          <select className={inputCls} value={type} onChange={(event) => { setType(event.target.value as DocumentType); setSelected([]); }}>
            <option value="JOB_BILL">Job bills</option>
            <option value="RECEIPT">Payment receipts</option>
          </select>
        </Field>
        <div className="flex items-end gap-2">
          <Button onClick={exportBatch} disabled={selected.length === 0}>
            <Download className="size-4" />
            Export selected XML ({selected.length})
          </Button>
          <Button variant="outline" onClick={() => documents.refetch()} aria-label="Refresh documents">
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </section>

      {documents.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading documents...</p> : documents.isError ? (
        <p role="alert" className="py-8 text-center text-sm text-destructive">Could not load unexported documents.</p>
      ) : available.length === 0 ? (
        <p className="border-y py-8 text-center text-sm text-muted-foreground">No unexported documents for this date and type.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-190 text-sm">
            <thead className="border-b text-left text-muted-foreground"><tr>
              <th className="px-3 py-3"><input type="checkbox" aria-label="Select all documents" checked={available.length > 0 && selected.length === available.length} onChange={(event) => toggleAll(event.target.checked)} /></th>
              <th className="px-3 py-3">Document</th><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Tally ledger</th><th className="px-3 py-3 text-right">Amount</th><th className="px-3 py-3">Status</th>
            </tr></thead>
            <tbody>{available.map((document) => <tr key={document.id} className="border-b last:border-0">
              <td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${document.documentNumber}`} disabled={!document.ready} checked={selected.includes(document.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, document.id] : current.filter((id) => id !== document.id))} /></td>
              <td className="px-3 py-3 font-medium">{document.documentNumber}</td><td className="px-3 py-3">{document.customerName}</td><td className="px-3 py-3">{document.ready ? "Mapped" : document.reason}</td><td className="px-3 py-3 text-right">{money(document.total)}</td><td className="px-3 py-3">{document.ready ? "Ready" : "Skipped"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}

      {batch && <section className="grid gap-4 border-y py-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Export batch {batch.batchId}</h2><p className="text-sm text-muted-foreground">Exported XML is not marked posted until you enter Tally voucher references.</p></div><Button variant="outline" onClick={() => downloadXml(batch)}><Download className="size-4" />Download XML again</Button></div>
        {batch.exported.map((document) => <div key={document.id} className="grid gap-3 sm:grid-cols-[1fr_240px] sm:items-center"><span className="text-sm">{document.documentNumber}</span><input className={inputCls} placeholder="Tally voucher reference after import" value={voucherNumbers[document.id] ?? ""} onChange={(event) => setVoucherNumbers((current) => ({ ...current, [document.id]: event.target.value }))} /></div>)}
        {batch.skipped.map((document) => <p key={document.id} className="text-sm text-amber-700">{document.documentNumber ?? document.id}: {document.reason}</p>)}
        {batch.exported.length > 0 && <div><Button onClick={confirmPosted} disabled={!batch.exported.some((document) => voucherNumbers[document.id]?.trim())}>Record confirmed postings</Button></div>}
      </section>}

      <section className="grid gap-4 border-y py-4">
        <div><h2 className="font-semibold">Import Tally ledgers</h2><p className="text-sm text-muted-foreground">Paste one ledger per row: code, name.</p></div>
        <Field label="Ledger export file"><input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" className={inputCls} onChange={async (event) => {
          const file = event.target.files?.[0];
          if (file) setLedgerImportText(await file.text());
        }} /></Field>
        <textarea className={inputCls} rows={4} value={ledgerImportText} onChange={(event) => setLedgerImportText(event.target.value)} placeholder={'LEDGER-001\tCustomer Ledger One'} />
        <div><Button variant="outline" onClick={importLedgers}><FileUp className="size-4" />Import ledger rows</Button></div>
      </section>

      <section className="grid gap-4 border-y py-4 md:grid-cols-4">
        <div className="md:col-span-4"><h2 className="font-semibold">Account mappings</h2></div>
        <Field label="Document type"><select className={inputCls} value={mappingType} onChange={(event) => { setMappingType(event.target.value as DocumentType); setAccountType(event.target.value === "JOB_BILL" ? "PARTS_SALES" : "BANK"); }}><option value="JOB_BILL">Job bill</option><option value="RECEIPT">Receipt</option></select></Field>
        <Field label="Account role"><select className={inputCls} value={accountType} onChange={(event) => setAccountType(event.target.value)}>{(mappingType === "JOB_BILL" ? ["PARTS_SALES", "LABOUR_SALES", "PARTS_DISCOUNT", "LABOUR_DISCOUNT", "VAT", "ROUND_OFF"] : ["BANK", "CASH"]).map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></Field>
        <Field label="Find ledger by code/name"><input className={inputCls} value={ledgerSearch} onChange={(event) => { setLedgerSearch(event.target.value); setSelectedLedgerCode(""); }} /></Field>
        <Field label="Selected ledger"><select className={inputCls} value={selectedLedgerCode} onChange={(event) => setSelectedLedgerCode(event.target.value)}><option value="">Choose a matching ledger</option>{ledgers.data?.ledgers.map((ledger) => <option key={ledger.id} value={ledger.code}>{ledger.code} - {ledger.name}</option>)}</select></Field>
        <div className="flex items-end"><Button variant="outline" onClick={saveMapping} disabled={!selectedLedgerCode}>Save mapping</Button></div>
        <div className="md:col-span-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">{mappings.data?.mappings.map((mapping) => <span key={`${mapping.documentType}-${mapping.accountType}`}>{mapping.documentType} / {mapping.accountType}: {mapping.tallyLedgerCode} - {mapping.tallyLedgerName}</span>)}</div>
      </section>
    </div>
  );
}
