"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { getAccessTokenFromCookie } from "@/lib/auth/session";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { jobCardKeys } from "../api/job-card.keys";
import { draftOf, findingPayload } from "../lib/diagnosis.logic";
import type { SaveState } from "../lib/check-in.logic";
import type {
  BayOption,
  FindingDraft,
  JobDiagnosis,
  JobFinding,
  LabourOption,
  PartOption,
  TechnicianRow,
} from "../types/job-diagnosis.types";

export const diagnosisKey = (id: string) => [...jobCardKeys.detail(id), "diagnosis"] as const;

/** Allocation, findings and the engineer's review for one job. */
export function useJobDiagnosis(id: string, enabled = true) {
  return useQuery({
    queryKey: diagnosisKey(id),
    queryFn: () => apiGet<JobDiagnosis>(`/service/job-cards/${id}/diagnosis`),
    enabled: enabled && !!id,
  });
}

/** Active technicians of the branch with their load, from the existing technician list. */
export function useAllocationTechnicians(branchId: string, enabled = true) {
  return useQuery({
    queryKey: ["workshop", "technicians", "allocation", branchId],
    queryFn: () =>
      apiGet<{ technicians: TechnicianRow[] }>(`/workshop/technicians?branchId=${encodeURIComponent(branchId)}&activeOnly=true&limit=100`),
    enabled: enabled && !!branchId,
  });
}

export function useDiagnosisBays(id: string, enabled = true) {
  return useQuery({
    queryKey: [...diagnosisKey(id), "bays"],
    queryFn: () => apiGet<{ currentBayId: string | null; bays: BayOption[] }>(`/service/job-cards/${id}/diagnosis/bays`),
    enabled: enabled && !!id,
  });
}

/** Work the technician can add: the vehicle model's labour operations, without prices. */
export function useLabourOptions(id: string, q: string, enabled: boolean) {
  return useQuery({
    queryKey: [...diagnosisKey(id), "labour-options", q],
    queryFn: () =>
      apiGet<{ scope: "MODEL" | "ALL"; model: string | null; options: LabourOption[] }>(
        `/service/job-cards/${id}/diagnosis/labour-options?q=${encodeURIComponent(q)}`,
      ),
    enabled,
    staleTime: 60_000,
  });
}

/** Parts by number or name, without prices or stock. */
export function usePartOptions(id: string, q: string, enabled: boolean) {
  return useQuery({
    queryKey: [...diagnosisKey(id), "part-options", q],
    queryFn: () => apiGet<{ options: PartOption[] }>(`/service/job-cards/${id}/diagnosis/part-options?q=${encodeURIComponent(q)}`),
    enabled,
    staleTime: 60_000,
  });
}

/** After a findings change: the gates on the action bar and the routing card follow. */
function useRefreshDiagnosis(id: string) {
  const client = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        client.invalidateQueries({ queryKey: diagnosisKey(id) }),
        client.invalidateQueries({ queryKey: jobCardKeys.workspace(id) }),
      ]),
    [client, id],
  );
}

export function useRemoveFinding(id: string) {
  const refresh = useRefreshDiagnosis(id);
  return useMutation({
    networkMode: "always",
    mutationFn: (findingId: string) => apiDelete<null>(`/service/job-cards/${id}/diagnosis/findings/${findingId}`),
    onSuccess: refresh,
  });
}

export function useAddFindingPhoto(id: string) {
  const refresh = useRefreshDiagnosis(id);
  return useMutation({
    networkMode: "always",
    mutationFn: (input: { findingId: string; requestId: string; image: string }) =>
      apiPost<{ id: string }, { requestId: string; image: string }>(`/service/job-cards/${id}/diagnosis/findings/${input.findingId}/photos`, {
        requestId: input.requestId,
        image: input.image,
      }),
    onSuccess: refresh,
  });
}

export function useRemoveFindingPhoto(id: string) {
  const refresh = useRefreshDiagnosis(id);
  return useMutation({
    networkMode: "always",
    mutationFn: (input: { findingId: string; photoId: string }) =>
      apiDelete<null>(`/service/job-cards/${id}/diagnosis/findings/${input.findingId}/photos/${input.photoId}`),
    onSuccess: refresh,
  });
}

const AUTOSAVE_DELAY = 1200;

/**
 * One finding on screen, saved a moment after each change. A new finding gets its id here, once,
 * so a retried save never creates a second one. A failed save keeps every change on screen with
 * a retry; nothing typed is lost. A newer save from another screen is never overwritten.
 */
export function useFindingAutosave(jobCardId: string, complaintId: string | null, finding: JobFinding | null, editable: boolean, newId?: string) {
  const client = useQueryClient();
  const refresh = useRefreshDiagnosis(jobCardId);
  const [findingId, setFindingId] = useState(() => finding?.id ?? newId ?? crypto.randomUUID());
  const [saved, setSaved] = useState(!!finding);
  const version = useRef(finding?.version ?? 0);
  const [draft, setDraft] = useState<FindingDraft>(() => draftOf(finding));
  const [state, setState] = useState<SaveState>(finding ? { kind: "saved", at: finding.updatedAt } : { kind: "idle" });
  const latest = useRef(draft);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const url = `/service/job-cards/${jobCardId}/diagnosis/findings/${findingId}`;

  const save = useCallback(async () => {
    if (!editable || !dirty.current) return;
    if (inFlight.current) await inFlight.current;
    if (!dirty.current) return;
    dirty.current = false;
    const body = findingPayload(complaintId, latest.current, version.current);
    setState({ kind: "saving" });
    const run = apiPut<JobFinding, typeof body>(url, body)
      .then((saved) => {
        version.current = saved.version;
        setSaved(true);
        setState({ kind: "saved", at: saved.updatedAt });
        client.setQueryData<JobDiagnosis>(diagnosisKey(jobCardId), (current) =>
          current
            ? {
                ...current,
                findings: current.findings.some((row) => row.id === saved.id)
                  ? current.findings.map((row) => (row.id === saved.id ? saved : row))
                  : [...current.findings, saved],
              }
            : current,
        );
        // Not awaited: a refresh must never hold up the next save.
        void refresh();
      })
      .catch((error: unknown) => {
        dirty.current = true;
        const response = (error as { response?: { status?: number; data?: { code?: string } } }).response;
        if (response?.status === 409 && response.data?.code === "FINDING_VERSION") setState({ kind: "conflict" });
        else setState({ kind: "error", message: apiErrorMessage(error, "Check your connection and try again.") });
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = run;
    await run;
  }, [client, complaintId, editable, jobCardId, refresh, url]);

  const update = useCallback(
    (change: Partial<FindingDraft>) => {
      if (!editable) return;
      const next = { ...latest.current, ...change };
      latest.current = next;
      dirty.current = true;
      setDraft(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), AUTOSAVE_DELAY);
    },
    [editable, save],
  );

  /** Saves now (Retry, before adding a photo, before handing on). Resolves true when all is saved. */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await save();
    return !dirty.current;
  }, [save]);

  /** After a conflict: take the other screen's version. This screen's changes are replaced. */
  const reload = useCallback(async () => {
    await client.invalidateQueries({ queryKey: diagnosisKey(jobCardId) });
    const fresh = client.getQueryData<JobDiagnosis>(diagnosisKey(jobCardId))?.findings.find(
      (row) => row.id === findingId || (complaintId !== null && row.complaintId === complaintId),
    );
    if (fresh) setFindingId(fresh.id);
    setSaved(!!fresh);
    version.current = fresh?.version ?? 0;
    const next = draftOf(fresh ?? null);
    latest.current = next;
    dirty.current = false;
    setDraft(next);
    setState(fresh ? { kind: "saved", at: fresh.updatedAt } : { kind: "idle" });
  }, [client, complaintId, findingId, jobCardId]);

  // Leaving or reloading within the autosave delay: send what is pending with a request that outlives the page.
  useEffect(() => {
    const flushOnLeave = () => {
      if (!editable || !dirty.current || inFlight.current) return;
      const token = getAccessTokenFromCookie();
      dirty.current = false;
      void fetch(`/api${url}`, {
        method: "PUT",
        keepalive: true,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(findingPayload(complaintId, latest.current, version.current)),
      }).catch(() => {
        dirty.current = true;
      });
    };
    window.addEventListener("pagehide", flushOnLeave);
    return () => window.removeEventListener("pagehide", flushOnLeave);
  }, [complaintId, editable, url]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current) void save();
    },
    [save],
  );

  return { findingId, saved, draft, update, flush, reload, state, pending: () => dirty.current };
}
