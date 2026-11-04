import { z } from 'zod';
import type { FilterKey } from '../core/types';

/** The legacy "std filters": model, variant, service type, service group and engineer (job type is its own choice). */
export const MIS_STD_FILTERS: FilterKey[] = ['model', 'variant', 'serviceType', 'serviceGroup', 'engineer'];

/** Legacy job type: regular, PDI or both. */
export const jobTypeParam = z.enum(['REGULAR', 'PDI', 'BOTH']);

export const jobTypeDoc = { name: 'jobType', description: 'REGULAR (default), PDI or BOTH.', schema: { type: 'string', enum: ['REGULAR', 'PDI', 'BOTH'] } };
