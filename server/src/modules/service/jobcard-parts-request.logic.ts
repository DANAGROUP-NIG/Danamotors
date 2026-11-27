import { BadRequestError } from '../../shared/errors/appError';

export function assertPartsRequested(job: { partsRequestedAt?: Date | null }) {
  if (!job.partsRequestedAt) throw new BadRequestError('The parts request for this job has not been sent yet. The service advisor sends it by recording the customer\'s approval of the estimate.');
}
