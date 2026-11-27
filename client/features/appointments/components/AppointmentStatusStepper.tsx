"use client";

import { cn } from "@/lib/utils";
import { CheckIcon, Ban } from "lucide-react";
import {
  APPOINTMENT_STEPS,
  type AppointmentProgress,
} from "../lib/appointment-progress";

interface AppointmentStatusStepperProps {
  currentStatus: AppointmentProgress;
}

const STATUS_FLOW: readonly string[] = APPOINTMENT_STEPS;
const STOPPED_MESSAGES = {
  Cancelled: "This appointment has been cancelled",
  "No Show": "The customer did not attend this appointment",
  "Linked jobs cancelled":
    "All job cards linked to this appointment have been cancelled",
};

export function AppointmentStatusStepper({
  currentStatus,
}: AppointmentStatusStepperProps) {
  if (currentStatus in STOPPED_MESSAGES) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
        <Ban className="size-5 text-destructive" />
        <div>
          <span className="font-semibold text-destructive">
            {currentStatus}
          </span>
          <span className="ml-2 text-sm text-muted-foreground">
            {STOPPED_MESSAGES[currentStatus as keyof typeof STOPPED_MESSAGES]}
          </span>
        </div>
      </div>
    );
  }

  const currentIndex =
    currentStatus === "Completed"
      ? STATUS_FLOW.length
      : STATUS_FLOW.indexOf(currentStatus);
  const isCompleted = (index: number) => index < currentIndex;
  const isActive = (index: number) => index === currentIndex;
  const isFuture = (index: number) => index > currentIndex;

  return (
    <div className="w-full overflow-x-auto py-4">
      <div className="flex min-w-max items-center gap-2 px-4">
        {STATUS_FLOW.map((status, index) => {
          const completed = isCompleted(index);
          const active = isActive(index);
          const future = isFuture(index);

          return (
            <div key={status} className="flex items-center">
              {/* Step Circle */}
              <div
                className="flex flex-col items-center"
                aria-current={active ? "step" : undefined}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-medium transition-all",
                    completed && "border-green-600 bg-green-600 text-white",
                    active &&
                      "border-blue-500 bg-white text-blue-600 ring-4 ring-blue-100",
                    future && "border-slate-200 bg-white text-slate-400",
                  )}
                >
                  {completed ? (
                    <CheckIcon aria-hidden="true" className="h-5 w-5" />
                  ) : active ? (
                    <span className="size-2.5 rounded-full bg-blue-500" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={cn(
                    "mt-2 text-sm font-medium",
                    completed && "text-green-600",
                    active && "text-blue-600",
                    future && "text-slate-400",
                  )}
                >
                  {status}
                  {completed && <span className="sr-only">, completed</span>}
                </span>
              </div>

              {/* Connector Line */}
              {index < STATUS_FLOW.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 w-12 flex-shrink-0",
                    completed ? "bg-green-600" : "bg-slate-200",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
