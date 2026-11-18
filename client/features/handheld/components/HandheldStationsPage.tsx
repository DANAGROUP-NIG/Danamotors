"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, KeyRound, Monitor, Plus, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS, PART_SALE_PERMISSIONS, STOCK_AUDIT_PERMISSIONS, STOCK_TAKE_PERMISSIONS } from "@/features/auth/roles";
import { fmtDateTime } from "@/features/stock-transfers/lib/indent-status";
import { useBranchStore } from "@/store/branch.store";
import { cn } from "@/lib/utils";
import { useCreateStation, useHandheldOverview, useHandheldSources, useRenameDevice, useRevokeStation, useRotateStationKey } from "../hooks/use-handheld";
import { HANDHELD_STATUS } from "./HandheldCard";
import type { HandheldDevice, HandheldDocumentType, HandheldJobRow, HandheldStation } from "../types/handheld.types";

const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 whitespace-nowrap";

/** The job's document and its page. */
function jobLink(j: HandheldJobRow): { label: string; href: string } {
  if (j.pickingList) return { label: `Indent ${j.pickingList.indent.indentNumber}`, href: `/transfers/indents/${j.pickingList.indent.id}` };
  if (j.customerOrder) return { label: `CPO ${j.customerOrder.cpoNumber}`, href: `/part-sale/orders/${j.customerOrder.id}` };
  if (j.mit) return { label: `MIT ${j.mit.mitNumber}`, href: `/inventory/mobis-receipts/${j.mit.id}` };
  const s = j.stockTakeSheet!;
  const audit = s.stockTake.type === "AUDIT";
  return { label: `${audit ? "Audit sheet" : "Count sheet"} ${s.sheetNumber}`, href: `/inventory/${audit ? "stock-audit" : "stock-taking"}/${s.stockTake.id}/sheets/${s.id}` };
}

const READY: { type: HandheldDocumentType; title: string; number: string; reference: string; party: string; permissions: string[] }[] = [
  { type: "COUNT_SHEET", title: "Count sheets to count", number: "Sheet", reference: "Stock taking", party: "Checker", permissions: [STOCK_TAKE_PERMISSIONS.MANAGE, STOCK_AUDIT_PERMISSIONS.MANAGE] },
  { type: "INDENT_PICK", title: "Indents to pick for transfer", number: "Indent", reference: "Picking list", party: "For branch", permissions: [INVENTORY_PERMISSIONS.TRANSFER_DISPATCH] },
  { type: "CPO_PICK", title: "Customer orders to pick", number: "CPO", reference: "Customer ref", party: "Customer", permissions: [PART_SALE_PERMISSIONS.ORDER] },
  { type: "MIT_RECEIVE", title: "MITs to check", number: "MIT", reference: "Invoice", party: "Vendor", permissions: [INVENTORY_PERMISSIONS.STOCK_UPDATE] },
];

/** One kind of document ready for the handheld and not sent yet; each row opens the page where it is sent. */
function ReadyList({ ready }: { ready: (typeof READY)[number] }) {
  const { hasAnyPermission } = useAuth();
  const allowed = hasAnyPermission(ready.permissions);
  const { data: sources, isLoading } = useHandheldSources(ready.type, allowed);
  if (!allowed) return null;
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-700">
        {ready.title} {sources && <span className="font-normal text-slate-400">({sources.length})</span>}
      </p>
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : !sources?.length ? (
        <p className="text-sm text-slate-500">Nothing waiting.</p>
      ) : (
        <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className={thCls}>{ready.number}</th>
                <th className={thCls}>{ready.reference}</th>
                <th className={thCls}>{ready.party}</th>
                <th className={thCls}>Date</th>
                <th className={cn(thCls, "text-right")}>{ready.type === "COUNT_SHEET" ? "Parts" : "Lines"}</th>
                {ready.type !== "COUNT_SHEET" && <th className={cn(thCls, "text-right")}>Qty</th>}
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.sourceId} className="border-t border-slate-100">
                  <td className={cn(tdCls, "font-mono")}>
                    <Link className="text-primary underline" href={s.link}>
                      {s.number}
                    </Link>
                  </td>
                  <td className={cn(tdCls, "text-slate-500")}>{s.reference ?? "—"}</td>
                  <td className="max-w-56 truncate px-3 py-2">{s.party || "—"}</td>
                  <td className={cn(tdCls, "text-slate-500")}>{fmtDateTime(s.date)}</td>
                  <td className={cn(tdCls, "text-right")}>{s.lines}</td>
                  {ready.type !== "COUNT_SHEET" && <td className={cn(tdCls, "text-right")}>{s.quantity}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** The key is shown once: IT pastes it into HHDC Link on that PC (Station...). */
function KeyDialog({ title, stationKey, onClose }: { title: string; stationKey: string; onClose: () => void }) {
  return (
    <ModalFame isOpen onClose={onClose} title={title}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          On the store PC, open HHDC Link, click <b>Station…</b>, paste this key and tick <b>Start the station when this Windows user signs in</b>.
          The key is shown only now; if it is lost, issue a new one.
        </p>
        <div className="flex items-center gap-2">
          <input className={cn(inputCls, "font-mono text-sm")} readOnly value={stationKey} onFocus={(e) => e.target.select()} />
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => navigator.clipboard.writeText(stationKey).then(() => toast.success("Key copied"))}
          >
            <Copy className="size-4" /> Copy
          </Button>
        </div>
        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </ModalFame>
  );
}

function RegisterDialog({ onClose, onKey }: { onClose: () => void; onKey: (title: string, key: string) => void }) {
  const { user } = useAuth();
  const branches = useBranchStore((s) => s.branches);
  const create = useCreateStation();
  const [branchId, setBranchId] = useState(user?.branchId ?? "");
  const [name, setName] = useState("");
  return (
    <ModalFame isOpen onClose={onClose} title="Register a handheld station">
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          A store PC with the handheld cradle (Windows Mobile Device Center) and HHDC Link. Use the PC&apos;s Windows name, e.g. STORE-PC1.
        </p>
        <Field label="Branch" required>
          <select className={inputCls} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Select branch</option>
            {branches
              .filter((b) => b.isActive !== false)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="PC name" required>
          <input className={inputCls} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            disabled={!branchId || !name.trim() || create.isPending}
            onClick={() =>
              create.mutate(
                { branchId, name: name.trim() },
                { onSuccess: (r) => { onClose(); onKey(`Key for ${r.station.name}`, r.key); } },
              )
            }
          >
            {create.isPending ? "Registering…" : "Register"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}

function RenameDialog({ device, onClose }: { device: HandheldDevice; onClose: () => void }) {
  const rename = useRenameDevice();
  const [name, setName] = useState(device.name);
  return (
    <ModalFame isOpen onClose={onClose} title={`Rename handheld ${device.name}`}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">Use the name on the label stuck to the handheld, so the store knows which one has the job.</p>
        <Field label="Name">
          <input className={inputCls} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button disabled={!name.trim() || rename.isPending} onClick={() => rename.mutate({ id: device.id, name: name.trim() }, { onSuccess: onClose })}>
            Rename
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}

/**
 * Settings > HHDC (moved from Inventory at the user's request, 2026-10-28): the branch's handheld stations, its handhelds and the
 * jobs waiting or on a handheld, for the store manager. Admins (handheld:stations) register PCs here.
 */
export function HandheldStationsPage() {
  const { data, isLoading } = useHandheldOverview();
  const rotate = useRotateStationKey();
  const revoke = useRevokeStation();
  const [registering, setRegistering] = useState(false);
  const [shownKey, setShownKey] = useState<{ title: string; key: string } | null>(null);
  const [renaming, setRenaming] = useState<HandheldDevice | null>(null);

  if (isLoading || !data) return <LoadingSkeleton variant="detail" />;
  const stations = data.stations.filter((s) => !s.revokedAt);
  const revoked = data.stations.filter((s) => s.revokedAt);

  const stationRow = (s: HandheldStation) => (
    <tr key={s.id} className="border-t border-slate-100">
      <td className={cn(tdCls, "font-medium")}>{s.name}</td>
      <td className={tdCls}>{s.branch.name}</td>
      <td className={tdCls}>
        {s.revokedAt ? (
          <StatusBadge status="Revoked" tone="gray" />
        ) : (
          <StatusBadge status={s.online ? "Online" : "Offline"} tone={s.online ? "emerald" : "red"} />
        )}
      </td>
      <td className={cn(tdCls, "text-slate-500")}>{fmtDateTime(s.lastSeenAt)}</td>
      <td className={tdCls}>{s.online && s.dockedDevice ? s.dockedDevice.name : <span className="text-slate-400">—</span>}</td>
      <td className={tdCls}>
        {s.online && s.printerModel ? (
          <span title={s.printerDetail ?? undefined}>
            <StatusBadge status={s.printerStatus === "READY" ? "Ready" : (s.printerStatus ?? "Error").replace("_", " ").toLowerCase()} tone={s.printerStatus === "READY" ? "emerald" : "amber"} />
            <span className="ml-2 text-slate-500">{s.printerModel}</span>
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className={cn(tdCls, "font-mono text-sm text-slate-500")}>{s.linkVersion ?? "—"}</td>
      <td className="max-w-72 truncate px-3 py-2 text-sm text-red-600" title={s.lastError ?? undefined}>
        {s.lastError}
      </td>
      {data.canManage && (
        <td className={cn(tdCls, "text-right")}>
          {!s.revokedAt && (
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={rotate.isPending}
                onClick={() => rotate.mutate(s.id, { onSuccess: (r) => setShownKey({ title: `New key for ${r.station.name}`, key: r.key }) })}
              >
                <KeyRound className="size-4" /> New key
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600"
                onClick={() => {
                  if (window.confirm(`Revoke station ${s.name}? It stops delivering and collecting at once.`)) revoke.mutate(s.id);
                }}
              >
                Revoke
              </Button>
            </div>
          )}
        </td>
      )}
    </tr>
  );

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="HHDC"
        description="The handheld: what is ready to send, the jobs not yet posted, and the store PCs (stations) that move them while a handheld is docked. Jobs are sent and posted on each document's page."
        actions={
          data.canManage && (
            <Button size="sm" className="gap-1.5" onClick={() => setRegistering(true)}>
              <Plus className="size-4" /> Register station
            </Button>
          )
        }
      />

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="mb-1 text-sm font-semibold text-slate-700">Ready for the handheld</p>
        <p className="mb-4 text-sm text-slate-500">Not sent yet. Open one and click Send to handheld.</p>
        <div className="space-y-5">
          {READY.map((r) => (
            <ReadyList key={r.type} ready={r} />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Monitor className="size-4" /> Stations
        </p>
        {stations.length === 0 ? (
          <p className="text-sm text-slate-500">
            No station is registered{data.canManage ? ": register the store PC with the cradle, then enter its key in HHDC Link on that PC." : ". Ask IT to set one up."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thCls}>PC</th>
                  <th className={thCls}>Branch</th>
                  <th className={thCls}>State</th>
                  <th className={thCls}>Last seen</th>
                  <th className={thCls}>Docked handheld</th>
                  <th className={thCls}>Label printer</th>
                  <th className={thCls}>HHDC Link</th>
                  <th className={thCls}>Last problem</th>
                  {data.canManage && <th className={thCls} />}
                </tr>
              </thead>
              <tbody>
                {stations.map(stationRow)}
                {revoked.map(stationRow)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Smartphone className="size-4" /> Handhelds
        </p>
        {data.devices.length === 0 ? (
          <p className="text-sm text-slate-500">A handheld is named here the first time it is docked at a station.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thCls}>Name</th>
                  <th className={thCls}>Branch</th>
                  <th className={thCls}>Last docked</th>
                  <th className={thCls}>At</th>
                  <th className={thCls}>App</th>
                  {data.canManage && <th className={thCls} />}
                </tr>
              </thead>
              <tbody>
                {data.devices.map((d) => (
                  <tr key={d.id} className="border-t border-slate-100">
                    <td className={cn(tdCls, "font-medium")}>{d.name}</td>
                    <td className={tdCls}>{d.branch.name}</td>
                    <td className={cn(tdCls, "text-slate-500")}>{fmtDateTime(d.lastSeenAt)}</td>
                    <td className={tdCls}>{d.lastStation?.name ?? "—"}</td>
                    <td className={tdCls}>
                      {d.appStatus === "INSTALL_FAILED" ? (
                        <span className="text-red-600" title={d.appError ?? undefined}>
                          Not updated: {d.appError}
                        </span>
                      ) : (
                        <span className="font-mono text-sm text-slate-500">{d.appVersion ?? "—"}</span>
                      )}
                    </td>
                    {data.canManage && (
                      <td className={cn(tdCls, "text-right")}>
                        <Button size="sm" variant="outline" onClick={() => setRenaming(d)}>
                          Rename
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="mb-3 text-sm font-semibold text-slate-700">Jobs not yet posted</p>
        {data.jobs.length === 0 ? (
          <p className="text-sm text-slate-500">No job is waiting for, on, or back from a handheld.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thCls}>Document</th>
                  <th className={thCls}>Job</th>
                  <th className={thCls}>Branch</th>
                  <th className={thCls}>Picker / checker</th>
                  <th className={thCls}>State</th>
                  <th className={thCls}>Since</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((j) => {
                  const link = jobLink(j);
                  return (
                    <tr key={j.id} className="border-t border-slate-100">
                      <td className={tdCls}>
                        <Link className="text-primary underline" href={link.href}>
                          {link.label}
                        </Link>
                      </td>
                      <td className={cn(tdCls, "font-mono text-sm")}>{j.documentNumber}</td>
                      <td className={tdCls}>{j.branch.name}</td>
                      <td className={tdCls}>{j.pickerName || "—"}</td>
                      <td className={tdCls}>
                        <StatusBadge
                          status={j.status === "SENT" && j.deliveredDevice ? `On handheld (${j.deliveredDevice.name})` : HANDHELD_STATUS[j.status].label}
                          tone={HANDHELD_STATUS[j.status].tone}
                        />
                      </td>
                      <td className={cn(tdCls, "text-slate-500")}>{fmtDateTime(j.status === "RECEIVED" ? j.receivedAt : j.status === "SENT" ? j.sentAt : j.queuedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {registering && <RegisterDialog onClose={() => setRegistering(false)} onKey={(title, key) => setShownKey({ title, key })} />}
      {shownKey && <KeyDialog title={shownKey.title} stationKey={shownKey.key} onClose={() => setShownKey(null)} />}
      {renaming && <RenameDialog device={renaming} onClose={() => setRenaming(null)} />}
    </div>
  );
}
