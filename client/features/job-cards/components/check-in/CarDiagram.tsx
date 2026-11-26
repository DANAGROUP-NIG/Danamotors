"use client";
import { useRef, type KeyboardEvent, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { DAMAGE_VIEW, damageLine, nudge, tapPosition } from "../../lib/check-in.logic";
import type { DamageMark, DamageType } from "../../types/job-check-in.types";

/** Marker colours follow the StatusBadge tones: crack gray, dent amber, scratch blue. */
const MARK_STYLE: Record<DamageType, string> = {
  CRACK: "fill-gray-50 stroke-gray-700 [&_text]:fill-gray-700",
  DENT: "fill-amber-50 stroke-amber-700 [&_text]:fill-amber-700",
  SCRATCH: "fill-blue-50 stroke-blue-700 [&_text]:fill-blue-700",
};

const WIDTH = 200;
const HEIGHT = 400;

/**
 * A top-down outline of a car, front at the top and the car's left on the left, drawn here so
 * there is no image to load. Marks sit at percentages of the drawing.
 */
export function CarDiagram({
  marks,
  draft,
  editable,
  onTap,
  onMoveDraft,
}: {
  marks: Pick<DamageMark, "id" | "type" | "x" | "y">[];
  /** A mark being placed, before its type is chosen. */
  draft: { x: number; y: number } | null;
  editable: boolean;
  onTap: (position: { x: number; y: number }) => void;
  onMoveDraft: (position: { x: number; y: number }) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const tap = (event: MouseEvent<SVGSVGElement>) => {
    if (!editable || !svg.current) return;
    onTap(tapPosition(event.clientX, event.clientY, svg.current.getBoundingClientRect()));
  };
  const moveDraft = (event: KeyboardEvent<SVGGElement>) => {
    if (!draft) return;
    const next = nudge(draft, event.key);
    if (!next) return;
    event.preventDefault();
    onMoveDraft(next);
  };
  return (
    <div className="mx-auto w-full max-w-[220px]">
      <p className="mb-1 text-center text-xs font-medium text-muted-foreground">Front</p>
      <svg
        ref={svg}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="group"
        aria-label={editable ? "Car diagram, seen from above. Tap where the damage is." : "Car diagram, seen from above, with the damage marks"}
        className={cn("h-auto w-full touch-manipulation select-none", editable && "cursor-crosshair")}
        onClick={tap}
      >
        <g className="fill-card stroke-foreground/60" strokeWidth={2.5} strokeLinejoin="round">
          {/* Tyres */}
          <rect x={22} y={62} width={14} height={44} rx={5} className="fill-muted" />
          <rect x={164} y={62} width={14} height={44} rx={5} className="fill-muted" />
          <rect x={22} y={290} width={14} height={44} rx={5} className="fill-muted" />
          <rect x={164} y={290} width={14} height={44} rx={5} className="fill-muted" />
          {/* Body */}
          <path d="M100 8 C130 8 150 14 158 34 C164 50 166 76 166 110 L166 300 C166 340 164 366 156 380 C146 392 124 396 100 396 C76 396 54 392 44 380 C36 366 34 340 34 300 L34 110 C34 76 36 50 42 34 C50 14 70 8 100 8 Z" />
          {/* Mirrors */}
          <ellipse cx={27} cy={138} rx={8} ry={5} />
          <ellipse cx={173} cy={138} rx={8} ry={5} />
        </g>
        <g className="fill-muted stroke-foreground/40" strokeWidth={2} strokeLinejoin="round">
          {/* Windscreen, roof and rear window */}
          <path d="M50 118 Q100 102 150 118 L141 150 Q100 141 59 150 Z" />
          <rect x={59} y={152} width={82} height={116} rx={10} className="fill-card" />
          <path d="M59 270 Q100 279 141 270 L148 302 Q100 314 52 302 Z" />
        </g>
        <g className="fill-none stroke-foreground/30" strokeWidth={1.5}>
          {/* Bonnet, boot and door lines */}
          <path d="M44 104 Q100 92 156 104" />
          <path d="M44 330 Q100 342 156 330" />
          <path d="M34 200 L56 200 M144 200 L166 200" />
          <path d="M34 280 L54 280 M146 280 L166 280" />
          <path d="M52 22 Q62 16 76 14 M148 22 Q138 16 124 14" />
        </g>
        {marks.map((mark) => (
          <g key={mark.id} className={MARK_STYLE[mark.type]} aria-label={damageLine(mark)} role="img">
            <circle cx={(mark.x / 100) * WIDTH} cy={(mark.y / 100) * HEIGHT} r={12} strokeWidth={2} />
            <text
              x={(mark.x / 100) * WIDTH}
              y={(mark.y / 100) * HEIGHT}
              textAnchor="middle"
              dominantBaseline="central"
              className="stroke-none text-[13px] font-semibold"
              aria-hidden="true"
            >
              {DAMAGE_VIEW[mark.type].letter}
            </text>
          </g>
        ))}
        {draft && (
          <g
            tabIndex={0}
            role="img"
            aria-label="New damage mark. Use the arrow keys to move it."
            className="fill-primary/15 stroke-primary outline-none focus-visible:[&_circle]:stroke-[4]"
            onKeyDown={moveDraft}
          >
            <circle cx={(draft.x / 100) * WIDTH} cy={(draft.y / 100) * HEIGHT} r={13} strokeWidth={2.5} strokeDasharray="4 3" />
          </g>
        )}
      </svg>
      <p className="mt-1 text-center text-xs font-medium text-muted-foreground">Rear</p>
    </div>
  );
}
