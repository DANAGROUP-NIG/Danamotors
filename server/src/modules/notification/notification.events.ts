export const WORKSHOP_EVENTS = {
  PART_REQUESTED: 'Parts requested', PARTS_ISSUED: 'Parts issued', PART_RECEIVED: 'Parts collection confirmed',
  PARTS_UNAVAILABLE: 'Waiting for parts', TECHNICIAN_ASSIGNED: 'Job assigned to you',
  JOB_SENT_FOR_QC: 'Job done ? QC required', QC_PASSED: 'QC passed', QC_FAILED: 'QC failed ? rework required',
  JOB_READY: 'Vehicle ready', PROMISED_24H: 'Promised delivery in 24 hours', PROMISED_12H: 'Promised delivery in 12 hours',
} as const;
export type WorkshopEvent = keyof typeof WORKSHOP_EVENTS;
// Email is intentionally excluded: issue #140 marks it as a suggestion.
export const EVENT_CHANNELS = Object.fromEntries(Object.keys(WORKSHOP_EVENTS).map(event => [event, ['in-app'] as const]));
export interface WorkshopNotificationPayload {
  dedupeKey: string; jobCardId: string; jobNumber: string; customer: string; registration: string; branchId: string;
}
export function workshopNotification(event: WorkshopEvent, payload: WorkshopNotificationPayload) {
  return { type: event, title: WORKSHOP_EVENTS[event], message: `${WORKSHOP_EVENTS[event]}: ${payload.jobNumber} ? ${payload.customer} ? ${payload.registration}`, link: `/job-cards/${payload.jobCardId}`, branchId: payload.branchId, dedupeKey: `${event}:${payload.dedupeKey}` };
}
