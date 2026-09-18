"use client";

import {
  ReactNode,
  useRef,
  useState,
  useCallback,
  useEffect,
  cloneElement,
  isValidElement,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useClickOutside } from "@/hooks/use-click-outside";
import { cn } from "@/lib/utils";

interface ActionMenuProps {
  children: ReactNode;
  trigger: ReactNode;
  align?: "start" | "end";
  className?: string;
}

export function ActionMenu({
  children,
  trigger,
  align = "end",
  className,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setOpen(false));

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    },
    [],
  );

  useEffect(() => {
    if (open) document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  const triggerNode = isValidElement(trigger)
    ? cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
        onClick: () => setOpen((v) => !v),
      })
    : trigger;

  return (
    <div ref={triggerRef} className="relative inline-block">
      {triggerNode}

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "absolute z-50 min-w-[14rem] overflow-hidden rounded-xl border border-border bg-white p-1 shadow-xl",
              align === "start" ? "left-0" : "right-0",
              "top-full mt-2",
              className,
            )}
            onClick={() => setOpen(false)}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ActionMenuDivider() {
  return <div className="my-1 h-px bg-border" />;
}
