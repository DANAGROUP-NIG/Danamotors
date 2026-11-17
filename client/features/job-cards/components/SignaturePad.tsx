"use client";
import { useRef, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";

/** Shared bounded PNG capture for customer approval and technician collection. */
export function SignaturePad({
  label,
  onChange,
  disabled = false,
}: {
  label: string;
  onChange: (image: string | null) => void;
  disabled?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const drawn = useRef(false);
  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) * 600) / rect.width,
      ((event.clientY - rect.top) * 200) / rect.height,
    ];
  }
  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    drawing.current = true;
    context.beginPath();
    const [x, y] = point(event);
    context.moveTo(x, y);
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const [x, y] = point(event);
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineTo(x, y);
    context.stroke();
    drawn.current = true;
  }
  function finish() {
    drawing.current = false;
    if (drawn.current && canvas.current)
      onChange(canvas.current.toDataURL("image/png"));
  }
  return (
    <div className="space-y-2">
      <canvas
        ref={canvas}
        width={600}
        height={200}
        aria-label={label}
        className="w-full touch-none rounded border border-border bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => {
          canvas.current?.getContext("2d")?.clearRect(0, 0, 600, 200);
          drawing.current = false;
          drawn.current = false;
          onChange(null);
        }}
      >
        Clear signature
      </Button>
    </div>
  );
}
