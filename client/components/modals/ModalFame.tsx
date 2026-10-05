"use client";
import { ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  description?: string;
  size?: "default" | "wide";
  flush?: boolean;
}

export default function ModalFame({
  isOpen,
  onClose,
  children,
  title,
  description,
  size = "default",
  flush = false,
}: ModalProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);

  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;

    const focusable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        ) ?? [],
      ).filter(
        (element) =>
          element.offsetParent !== null && !element.closest("[inert]"),
      );

    panel.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (event.key === "Escape") close.current();

      if (event.key !== "Tab") return;

      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];

      if (!first) {
        event.preventDefault();
        return;
      }

      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === panel.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === panel.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      {}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />

      {}
      <div
        ref={panel}
        tabIndex={-1}
        className={`relative z-10 my-auto w-full ${size === "wide" ? "max-w-6xl" : "max-w-2xl"} rounded-2xl border border-border bg-background shadow-2xl outline-none`}
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
