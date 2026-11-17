"use client";
import { DocumentTermsBlock } from "@/components/DocumentTermsBlock";
import { signatureFieldsValid } from "./signature-fields";
import { useState } from "react";
import { SignaturePad } from "./SignaturePad";
import { apiPost } from "@/lib/api/apiClient";
import { Button } from "@/components/ui/button";
import type { Estimate } from "../types/job-card.types";
export function EstimateSignatureDialog({
  estimate,
  customerId,
  branchId,
  customerName,
  onSaved,
  onClose,
}: {
  estimate: Estimate;
  customerId: string;
  branchId?: string;
  customerName: string;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [name, setName] = useState(customerName);
  const [relationship, setRelationship] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [approved, setApproved] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid =
    (!approved || consentAccepted) &&
    signatureFieldsValid({
      drawn: !!signatureImage,
      name,
      customerName,
      relationship,
      approved,
      reason,
    });
  async function save() {
    if (!signatureImage) return;
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      if (signatureImage.length > 88000)
        throw new Error("Signature is too large; please clear and sign again.");
      await apiPost(`/service/estimates/${estimate.id}/approvals`, {
        customerId,
        approved,
        consentAccepted,
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
        <SignaturePad
          label="Draw customer signature"
          onChange={setSignatureImage}
          disabled={busy}
        />
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
        <DocumentTermsBlock documentType="JOB_ESTIMATE" branchId={branchId} />
        {approved && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(event) => setConsentAccepted(event.target.checked)}
            />
            I approve this estimate and accept its terms and conditions above.
          </label>
        )}
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
