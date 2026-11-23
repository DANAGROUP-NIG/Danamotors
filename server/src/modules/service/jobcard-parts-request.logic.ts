import { BadRequestError } from '../../shared/errors/appError';

export function assertPartsRequested(job: { partsRequestedAt?: Date | null }) {
  if (!job.partsRequestedAt) throw new BadRequestError('Click Request Parts on the job card before issuing parts');
}
