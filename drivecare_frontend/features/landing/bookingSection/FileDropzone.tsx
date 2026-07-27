"use client";

import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  onFileSelect?: (file: File) => void;
}

export function FileDropzone({ onFileSelect }: FileDropzoneProps) {
  const { acceptedFiles, getRootProps, getInputProps, isDragActive } = useDropzone({
    maxFiles: 1,
    onDrop: (files) => {
      if (files[0]) {
        toast.success("Vehicle document added to your service request");
        onFileSelect?.(files[0]);
      }
    },
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "grid min-h-28 cursor-pointer place-items-center rounded-lg border border-dashed border-border bg-background p-5 text-center",
        isDragActive && "border-primary bg-secondary"
      )}
    >
      <input {...getInputProps()} />
      <div>
        <UploadCloud className="mx-auto size-6 text-primary" />
        <p className="mt-2 text-sm font-semibold">
          {acceptedFiles[0]?.name ?? "Drop a vehicle document, photo, or report"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PDF, image, or service record
        </p>
      </div>
    </div>
  );
}
