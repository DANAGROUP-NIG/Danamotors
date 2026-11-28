"use client";

import {
  ReactNode,
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  cloneElement,
  isValidElement,
  MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface ActionMenuProps {
  children: ReactNode;
  trigger: ReactNode;
  align?: "start" | "end";
  className?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  maxHeight: number;
  placement: "top" | "bottom";
}

const VIEWPORT_MARGIN = 8;
const MENU_GAP = 8;
const MIN_MENU_WIDTH = 224;

export function ActionMenu({
  children,
  trigger,
  align = "end",
  className,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const triggerElement = triggerRef.current;
    if (!triggerElement) return;

    const triggerRect = triggerElement.getBoundingClientRect();
    const menuWidth = Math.max(menuRef.current?.offsetWidth ?? 0, MIN_MENU_WIDTH);
    const menuHeight = menuRef.current?.scrollHeight ?? 0;
    const spaceBelow = window.innerHeight - triggerRect.bottom - MENU_GAP - VIEWPORT_MARGIN;
    const spaceAbove = triggerRect.top - MENU_GAP - VIEWPORT_MARGIN;
    const placement = menuHeight > spaceBelow && spaceAbove > spaceBelow ? "top" : "bottom";
    const availableHeight = Math.max(0, placement === "top" ? spaceAbove : spaceBelow);
    const visibleHeight = Math.min(menuHeight || availableHeight, availableHeight);
    const preferredLeft = align === "start" ? triggerRect.left : triggerRect.right - menuWidth;
    const left = Math.min(
      Math.max(preferredLeft, VIEWPORT_MARGIN),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - menuWidth - VIEWPORT_MARGIN),
    );
    const top = placement === "top"
      ? Math.max(VIEWPORT_MARGIN, triggerRect.top - MENU_GAP - visibleHeight)
      : triggerRect.bottom + MENU_GAP;

    setPosition({ top, left, maxHeight: availableHeight, placement });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
  }, [open, children, updatePosition]);

  // The menu sits at the end of the page (a portal), so Tab from the button would never reach it:
  // focus moves into the menu when it opens, and back to the button when Esc closes it.
  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => items()[0]?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.querySelector<HTMLElement>("button, a, [tabindex]")?.focus();
        return;
      }
      if (!menuRef.current?.contains(document.activeElement)) return;
      const list = items();
      const index = list.indexOf(document.activeElement as HTMLElement);
      const step = event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey) ? 1 : event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey) ? -1 : 0;
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        list[event.key === "Home" ? 0 : list.length - 1]?.focus();
      } else if (step && list.length) {
        // Tab and the arrow keys move through the items and wrap, as in a menu.
        event.preventDefault();
        list[(index + step + list.length) % list.length]?.focus();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  const triggerNode = isValidElement(trigger)
    ? cloneElement(
        trigger as React.ReactElement<{
          onClick?: (event: ReactMouseEvent) => void;
          "aria-expanded"?: boolean;
          "aria-haspopup"?: "menu";
        }>,
        {
          onClick: (event: ReactMouseEvent) => {
            const originalOnClick = (
              trigger.props as { onClick?: (event: ReactMouseEvent) => void }
            ).onClick;
            originalOnClick?.(event);
            if (!event.defaultPrevented) setOpen((value) => !value);
          },
          "aria-expanded": open,
          "aria-haspopup": "menu",
        },
      )
    : trigger;

  const menu = typeof document !== "undefined"
    ? createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menuRef}
              role="menu"
              initial={{ opacity: 0, y: 4, scale: 0.96 }}
              animate={{ opacity: position ? 1 : 0, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: "fixed",
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                maxHeight: position?.maxHeight,
                transformOrigin: position?.placement === "top" ? "bottom right" : "top right",
              }}
              className={cn(
                "z-[100] min-w-[14rem] overflow-y-auto rounded-xl border border-border bg-white p-1 shadow-xl",
                className,
              )}
              onClick={() => setOpen(false)}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )
    : null;

  return (
    <div ref={triggerRef} className="relative inline-block">
      {triggerNode}
      {menu}
    </div>
  );
}

export function ActionMenuDivider() {
  return <div className="my-1 h-px bg-border" />;
}
