/** Maps API validation paths to their corresponding job-opening controls. */
export function jobCardErrorField(path: string): string {
  const field = path.replace(/^body\./, "");
  return field === "promisedAt" ? "promisedDate" : field;
}
