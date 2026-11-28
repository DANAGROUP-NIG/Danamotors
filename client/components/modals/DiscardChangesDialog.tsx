"use client";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";

/**
 * Asks before leaving a screen with unsaved changes. It closes only on its two buttons,
 * the close button or Esc (which keep the changes), never on a click outside.
 */
export function DiscardChangesDialog({
  open,
  title,
  description,
  onStay,
  onLeave,
}: {
  open: boolean;
  title: string;
  description: string;
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <ModalFame isOpen={open} onClose={onStay} preventAccidentalClose title={title} description={description}>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onStay} autoFocus>
          Keep editing
        </Button>
        <Button type="button" variant="destructive" onClick={onLeave}>
          Leave without saving
        </Button>
      </div>
    </ModalFame>
  );
}
