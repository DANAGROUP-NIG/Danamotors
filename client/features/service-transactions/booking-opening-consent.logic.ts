export type OpeningConsentProof = { accepted: true; termsHash: string };
export type OpeningConsentDocument = {
  appointmentId: string; documentType: 'JOB_CARD'; statement: string;
  terms: string[]; footer: string | null; termsHash: string;
};

export function openingTermsReachedEnd(metrics: { scrollTop: number; clientHeight: number; scrollHeight: number }) {
  return metrics.clientHeight > 0 && metrics.scrollTop + metrics.clientHeight >= metrics.scrollHeight - 2;
}
