"use client";
import { useId, useRef, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFocusTrap } from "@/components/ui/use-focus-trap";
import { cn } from "@/lib/utils";
import { JOB_FILE_TABS, type JobFileTab } from "../../lib/job-frame.logic";
import type { JobCard } from "../../types/job-card.types";
import type { JobWorkspace } from "../../types/job-workspace.types";
import { ActivityTab, CustomerVehicleTab, DocumentsTab, VisitHistoryTab, WarrantyTab } from "./JobFileTabs";

/**
 * The Job file: everything about the job that is not the current step, in a right-hand drawer
 * (480 px, full screen on phones). Focus stays inside while it is open; Esc closes it.
 */
export function JobFileDrawer({
  open,
  tab,
  onTabChange,
  onClose,
  job,
  workspace,
  onPrintGatePass,
}: {
  open: boolean;
  tab: JobFileTab;
  onTabChange: (tab: JobFileTab) => void;
  onClose: () => void;
  job: JobCard;
  workspace: JobWorkspace;
  onPrintGatePass: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(panel, open, onClose);
  if (!open) return null;

  const tabId = (id: JobFileTab) => `job-file-tab-${id}`;
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: JobFileTab) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const ids = JOB_FILE_TABS.map((item) => item.id);
    const index = ids.indexOf(current);
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next = event.key === "Home" ? ids[0] : event.key === "End" ? ids[ids.length - 1] : ids[(index + step + ids.length) % ids.length];
    onTabChange(next);
    document.getElementById(tabId(next))?.focus();
  };

  return (
    <div className="fixed inset-0 z-50 print:hidden" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-border bg-background shadow-xl outline-none sm:w-120"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold">
              Job file
            </h2>
            <p className="truncate text-sm text-muted-foreground">Job {job.jobNumber}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close job file" title="Close job file">
            <X aria-hidden="true" />
          </Button>
        </div>
        <div role="tablist" aria-label="Job file sections" aria-orientation="horizontal" className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2">
          {JOB_FILE_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={tabId(item.id)}
              aria-selected={tab === item.id}
              aria-controls={`job-file-panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => onTabChange(item.id)}
              onKeyDown={(event) => onKeyDown(event, item.id)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`job-file-panel-${tab}`}
          aria-labelledby={tabId(tab)}
          tabIndex={0}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {tab === "customer" && <CustomerVehicleTab job={job} />}
          {tab === "visits" && <VisitHistoryTab job={job} visits={workspace.previousVisits} />}
          {tab === "warranty" && <WarrantyTab job={job} />}
          {tab === "documents" && <DocumentsTab job={job} onPrintGatePass={onPrintGatePass} />}
          {tab === "activity" && <ActivityTab job={job} activity={workspace.activity} />}
        </div>
      </div>
    </div>
  );
}
