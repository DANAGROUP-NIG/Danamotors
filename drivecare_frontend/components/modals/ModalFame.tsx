"use client";

import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export default function ModalFame({
  isOpen,
  onClose,
  children,
  title,
}: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      {/* Background Overlay + Blur */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative z-10 my-auto w-full max-w-lg overflow-hidden rounded-2xl border border-white/20 bg-background/95 shadow-2xl backdrop-blur-xl sm:rounded-3xl">
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6 sm:py-5">
            <h2 className="text-lg font-semibold sm:text-xl">{title}</h2>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 transition-colors hover:bg-muted"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto p-5 sm:max-h-[calc(100vh-10rem)] sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
