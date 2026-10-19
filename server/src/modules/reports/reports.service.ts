import { ReportInput } from './report.validation';
import { ReportSlug, ReportResult } from './report.types';
import { delivered, warrantyAttended, warrantyParts } from './delivery-warranty.report';
import { history } from './history.report';
import { bookedVsAvailed, estimateVsJob, unbilledParts } from './variation-parts.report';
import { corporateBills, taxRegister } from './billing.report';
export class ReportsService {
    async report(slug: ReportSlug, input: ReportInput): Promise<ReportResult> {
        switch (slug) {
            case 'delivered-model': return delivered(input, true);
            case 'delivered-service': return delivered(input, false);
            case 'warranty-attended': return warrantyAttended(input);
            case 'warranty-parts': return warrantyParts(input);
            case 'vehicle-history-card': return history(input);
            case 'booked-vs-availed': return bookedVsAvailed(input);
            case 'estimate-vs-job': return estimateVsJob(input);
            case 'unbilled-parts': return unbilledParts(input);
            case 'tax-register': return taxRegister(input);
            case 'corporate-bills': return corporateBills(input);
        }
    }
}
