"use client";
import { useState } from "react";
import { SignaturePad } from "./SignaturePad";
import { Button } from "@/components/ui/button";

export function PartCollectionSignature({
  label,
  pending,
  onSign,
}: {
  label: string;
  pending: boolean;
  onSign: (signatureImage: string) => void;
}) {
  const [image, setImage] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded border border-border p-3">
      <p>{label}</p>
      <p className="text-sm text-muted-foreground">
        Sign to confirm you collected these parts.
      </p>
      <SignaturePad
        label={`Draw collection signature for ${label}`}
        onChange={setImage}
        disabled={pending}
      />
      <Button
        type="button"
        disabled={!image || pending}
        onClick={() => {
          if (image) onSign(image);
        }}
      >
        Sign part received
      </Button>
    </div>
  );
}
