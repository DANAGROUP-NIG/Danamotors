export function formatJobCardLateReason(description: string) {
  return /^engineer absent$/i.test(description) ? "Technician absent" : description;
}
