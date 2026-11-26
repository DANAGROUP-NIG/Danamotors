"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { api } from "@/lib/api/axios";
import { getAccessTokenFromCookie } from "@/lib/auth/session";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { jobCardKeys } from "../api/job-card.keys";
import { dataUrlBytes, fitPhoto, PHOTO_MAX_BYTES, type SaveState } from "../lib/check-in.logic";
import type {
  CheckInDetailsInput,
  DamageMark,
  DamageMarkInput,
  JobCheckIn,
  JobPhoto,
  PhotoInput,
  WalkAroundDraft,
} from "../types/job-check-in.types";

export const checkInKey = (id: string) => [...jobCardKeys.detail(id), "check-in"] as const;
const consentKey = (id: string) => ["job-opening-consent", id] as const;

/** Check-in for the three steps: record, marks, photo list, gates and whether this person may edit. */
export function useJobCheckIn(id: string, enabled = true) {
  return useQuery({
    queryKey: checkInKey(id),
    queryFn: () => apiGet<JobCheckIn>(`/service/job-cards/${id}/check-in`),
    enabled: enabled && !!id,
  });
}

/** After any check-in change: the step's gates, the action bar and the consent document all follow. */
function useRefreshCheckIn(id: string) {
  const client = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        client.invalidateQueries({ queryKey: checkInKey(id) }),
        client.invalidateQueries({ queryKey: jobCardKeys.workspace(id) }),
        client.invalidateQueries({ queryKey: consentKey(id) }),
      ]),
    [client, id],
  );
}

export function useSaveCheckInDetails(id: string) {
  const client = useQueryClient();
  const refresh = useRefreshCheckIn(id);
  return useMutation({
    // Offline, fail at once and show the message (inputs are kept) rather than wait silently.
    networkMode: "always",
    mutationFn: (body: CheckInDetailsInput) => apiPut<JobCheckIn, CheckInDetailsInput>(`/service/job-cards/${id}/check-in/details`, body),
    onSuccess: async (checkIn) => {
      client.setQueryData(checkInKey(id), checkIn);
      await Promise.all([refresh(), client.invalidateQueries({ queryKey: jobCardKeys.detail(id), exact: true })]);
    },
  });
}

export function useAddDamageMark(id: string) {
  const refresh = useRefreshCheckIn(id);
  return useMutation({
    // Offline, fail at once and show the message (inputs are kept) rather than wait silently.
    networkMode: "always",
    mutationFn: (body: DamageMarkInput) => apiPost<DamageMark, DamageMarkInput>(`/service/job-cards/${id}/check-in/damage-marks`, body),
    onSuccess: refresh,
  });
}

export function useRemoveDamageMark(id: string) {
  const refresh = useRefreshCheckIn(id);
  return useMutation({
    // Offline, fail at once and show the message (inputs are kept) rather than wait silently.
    networkMode: "always",
    mutationFn: (markId: string) => apiDelete<null>(`/service/job-cards/${id}/check-in/damage-marks/${markId}`),
    onSuccess: refresh,
  });
}

export function useUploadPhoto(id: string) {
  const refresh = useRefreshCheckIn(id);
  return useMutation({
    // Offline, fail at once and show the message (inputs are kept) rather than wait silently.
    networkMode: "always",
    mutationFn: (body: PhotoInput) => apiPost<JobPhoto, PhotoInput>(`/service/job-cards/${id}/photos`, body),
    onSuccess: refresh,
  });
}

export function useRemovePhoto(id: string) {
  const refresh = useRefreshCheckIn(id);
  return useMutation({
    // Offline, fail at once and show the message (inputs are kept) rather than wait silently.
    networkMode: "always",
    mutationFn: (photoId: string) => apiDelete<null>(`/service/job-cards/${id}/photos/${photoId}`),
    onSuccess: refresh,
  });
}

/**
 * A stored photo as an object URL for an image tag. Photos need the sign-in header, so they are
 * fetched through the API client. A photo never changes, so it is kept for the session.
 */
export function usePhotoObjectUrl(jobCardId: string, photoId: string | null) {
  const query = useQuery({
    queryKey: ["job-photo", jobCardId, photoId],
    queryFn: async () => (await api.get<Blob>(`/service/job-cards/${jobCardId}/photos/${photoId}`, { responseType: "blob" })).data,
    enabled: !!photoId,
    staleTime: Infinity,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!query.data) return;
    const next = URL.createObjectURL(query.data);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [query.data]);
  return { url, isLoading: query.isLoading, isError: query.isError, retry: query.refetch };
}

/**
 * Reads a chosen or captured photo, resizes it to at most 1600 pixels a side and returns a JPEG
 * data URL under the 2 MB limit. Throws a message the advisor can act on.
 */
export async function preparePhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Choose a JPEG, PNG or WebP photo.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("The photo could not be read. Take it again.");
  });
  const size = fitPhoto(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The photo could not be read. Take it again.");
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  for (const quality of [0.82, 0.7, 0.55]) {
    const image = canvas.toDataURL("image/jpeg", quality);
    if (dataUrlBytes(image) <= PHOTO_MAX_BYTES) return image;
  }
  throw new Error("The photo is too large. Take it again closer to the subject.");
}

const AUTOSAVE_DELAY = 1200;

/**
 * Keeps the walk-around draft on screen and saves it a moment after each change. A failed save
 * keeps every change on screen and offers a retry; nothing typed is lost.
 */
export function useWalkAroundAutosave(id: string, initial: WalkAroundDraft & { version: number; savedAt: string | null }, editable: boolean) {
  const client = useQueryClient();
  const refresh = useRefreshCheckIn(id);
  const [draft, setDraft] = useState<WalkAroundDraft>(() => ({
    fuelLevel: initial.fuelLevel,
    checklist: initial.checklist,
    checklistNote: initial.checklistNote,
    serviceBookSeen: initial.serviceBookSeen,
    serviceBookStamps: initial.serviceBookStamps,
    noValuables: initial.noValuables,
    belongingsNote: initial.belongingsNote,
  }));
  const [state, setState] = useState<SaveState>(initial.savedAt ? { kind: "saved", at: initial.savedAt } : { kind: "idle" });
  const version = useRef(initial.version);
  const latest = useRef(draft);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const save = useCallback(async () => {
    if (!editable || !dirty.current) return;
    if (inFlight.current) await inFlight.current;
    if (!dirty.current) return;
    dirty.current = false;
    const body = { ...latest.current, expectedVersion: version.current };
    setState({ kind: "saving" });
    const run = apiPut<{ version: number; savedAt: string }, typeof body>(`/service/job-cards/${id}/check-in/walk-around`, body)
      .then((result) => {
        version.current = result.version;
        setState({ kind: "saved", at: result.savedAt });
        client.setQueryData<JobCheckIn>(checkInKey(id), (current) =>
          current ? { ...current, record: { ...current.record, ...body, version: result.version, savedAt: result.savedAt } } : current,
        );
        // Not awaited: a refresh that overlaps another (a damage mark, a photo) must never hold up the next save.
        void refresh();
      })
      .catch((error: unknown) => {
        // Keep the changes and mark them unsaved, so a retry sends them again.
        dirty.current = true;
        const status = (error as { response?: { status?: number; data?: { code?: string } } }).response;
        if (status?.status === 409 && status.data?.code === "CHECK_IN_VERSION") setState({ kind: "conflict" });
        else setState({ kind: "error", message: apiErrorMessage(error, "Check your connection and try again.") });
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = run;
    await run;
  }, [client, editable, id, refresh]);

  const update = useCallback(
    (change: Partial<WalkAroundDraft>) => {
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

  /** Saves now, for "Continue" and "Retry". Resolves true when everything is saved. */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await save();
    return !dirty.current;
  }, [save]);

  /** After a conflict: load the other screen's version. The changes on this screen are replaced. */
  const reload = useCallback(async () => {
    await client.invalidateQueries({ queryKey: checkInKey(id) });
    const fresh = client.getQueryData<JobCheckIn>(checkInKey(id));
    if (!fresh) return;
    const next: WalkAroundDraft = {
      fuelLevel: fresh.record.fuelLevel,
      checklist: fresh.record.checklist,
      checklistNote: fresh.record.checklistNote,
      serviceBookSeen: fresh.record.serviceBookSeen,
      serviceBookStamps: fresh.record.serviceBookStamps,
      noValuables: fresh.record.noValuables,
      belongingsNote: fresh.record.belongingsNote,
    };
    version.current = fresh.record.version;
    latest.current = next;
    dirty.current = false;
    setDraft(next);
    setState(fresh.record.savedAt ? { kind: "saved", at: fresh.record.savedAt } : { kind: "idle" });
  }, [client, id]);

  // Closing or reloading the page within the autosave delay: send what is pending with a request
  // that outlives the page (keepalive), so a quick refresh never loses the last tap.
  useEffect(() => {
    const flushOnLeave = () => {
      if (!editable || !dirty.current || inFlight.current) return;
      const token = getAccessTokenFromCookie();
      dirty.current = false;
      void fetch(`/api/service/job-cards/${id}/check-in/walk-around`, {
        method: "PUT",
        keepalive: true,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ...latest.current, expectedVersion: version.current }),
      }).catch(() => {
        dirty.current = true;
      });
    };
    window.addEventListener("pagehide", flushOnLeave);
    return () => window.removeEventListener("pagehide", flushOnLeave);
  }, [editable, id]);

  // Save anything pending when the step is left (switching tabs unmounts it).
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current) void save();
    },
    [save],
  );

  return { draft, update, flush, reload, state, pending: () => dirty.current };
}
