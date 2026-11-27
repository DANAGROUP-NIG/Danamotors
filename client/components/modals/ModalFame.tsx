"use client";
import { ReactNode, useId, useRef } from "react";
import { useFocusTrap } from "@/components/ui/use-focus-trap";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  description?: string;
  size?: "default" | "wide";
  flush?: boolean;
  preventAccidentalClose?: boolean;
  /** "sheet" rises from the bottom on phones (a bottom sheet) and is centred from the small breakpoint up. */
  placement?: "center" | "sheet";
}

export default function ModalFame({
  isOpen,
  onClose,
  children,
  title,
  description,
  size = "default",
  flush = false,
  preventAccidentalClose = false,
  placement = "center",
}: ModalProps) {
  const sheet = placement === "sheet";
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, isOpen, onClose, !preventAccidentalClose);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center overflow-y-auto ${sheet ? "items-end p-0 sm:items-center sm:p-6" : "items-center p-4 sm:p-6"}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      {}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-md"
        onClick={preventAccidentalClose ? undefined : onClose}
        aria-hidden="true"
      />

      {}
      <div
        ref={panel}
        tabIndex={-1}
        className={`relative z-10 w-full ${size === "wide" ? "max-w-6xl" : "max-w-2xl"} border border-border bg-background shadow-2xl outline-none ${sheet ? "mt-auto rounded-t-2xl sm:my-auto sm:rounded-2xl" : "my-auto rounded-2xl"}`}
      >
        {}
        {title && (
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6 sm:py-5">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold sm:text-xl">
                {title}
              </h2>
              {description && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </div>

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

        {}
        <div
          className={
            flush
              ? "overflow-hidden rounded-b-2xl"
              : "max-h-[calc(100dvh-8rem)] overflow-y-auto p-5 sm:max-h-[calc(100dvh-10rem)] sm:p-6"
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}
