"use client";
import { signatureFieldsValid } from "./signature-fields";
import { useRef, useState, type PointerEvent } from "react";
import { apiPost } from "@/lib/api/apiClient";
import { Button } from "@/components/ui/button";
import type { Estimate } from "../types/job-card.types";
export function EstimateSignatureDialog({
  estimate,
  customerId,
  customerName,
  onSaved,
  onClose,
}: {
  estimate: Estimate;
  customerId: string;
  customerName: string;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [drawn, setDrawn] = useState(false);
  const [name, setName] = useState(customerName);
  const [relationship, setRelationship] = useState("");
  const [approved, setApproved] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) * 600) / rect.width,
      ((event.clientY - rect.top) * 200) / rect.height,
    ];
  }
  function start(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const ctx = canvas.current!.getContext("2d")!;
    ctx.beginPath();
    const [x, y] = point(event);
    ctx.moveTo(x, y);
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const [x, y] = point(event);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineTo(x, y);
    ctx.stroke();
    setDrawn(true);
  }
  const valid = signatureFieldsValid({
    drawn,
    name,
    customerName,
    relationship,
    approved,
    reason,
  });
  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      const signatureImage = canvas.current!.toDataURL("image/png");
      if (signatureImage.length > 88000)
        throw new Error("Signature is too large; please clear and sign again.");
      await apiPost(`/service/estimates/${estimate.id}/approvals`, {
        customerId,
        approved,
        comments: reason.trim() || undefined,
        signerName: name.trim(),
        relationship: relationship.trim() || undefined,
        signatureImage,
        expectedVersion: estimate.version,
        expectedHash: estimate.contentHash,
      });
      await onSaved();
      onClose();
    } catch {
      setError(
        "Could not save signature. Reload if the estimate changed and check required fields.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Get customer signature"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 print:hidden"
    >
      <div className="mx-auto max-w-2xl space-y-4 rounded-xl bg-white p-6">
        <h2 className="text-lg font-semibold">Get customer signature</h2>
        <p>
          Revision {estimate.version} · {estimate.currency}{" "}
          {estimate.amount.toLocaleString("en-NG")}
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity / hours</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {estimate.lines?.map((line) => (
              <tr key={line.id}>
                <td>{line.description}</td>
                <td>{line.quantity}</td>
                <td>{line.rate}</td>
                <td>{line.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <label className="block">
          Signer name
          <input
            className="block w-full rounded border p-2"
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          Relationship (required when signing for {customerName})
          <input
            className="block w-full rounded border p-2"
            maxLength={200}
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
          />
        </label>
        <p>
          By signing, I confirm the decision below for this revision and total.
        </p>
        <canvas
          ref={canvas}
          width={600}
          height={200}
          aria-label="Draw customer signature"
          className="w-full touch-none rounded border bg-white"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={() => {
            drawing.current = false;
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
        />
        <Button
          variant="outline"
          onClick={() => {
            canvas.current!.getContext("2d")!.clearRect(0, 0, 600, 200);
            setDrawn(false);
          }}
        >
          Clear signature
        </Button>
        <label className="block">
          Decision
          <select
            className="ml-2 rounded border p-2"
            value={String(approved)}
            onChange={(e) => setApproved(e.target.value === "true")}
          >
            <option value="true">Approve</option>
            <option value="false">Decline</option>
          </select>
        </label>
        <label className="block">
          Reason (required to decline)
          <textarea
            className="block w-full rounded border p-2"
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="flex gap-2">
          <Button disabled={!valid || busy} onClick={save}>
            Save customer decision
          </Button>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
