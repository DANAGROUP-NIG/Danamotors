import { JobCardType, type Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { ConflictError, NotFoundError } from "../../shared/errors/appError";
import { getCompanyProfile } from "../company-settings/company-settings.service";
import { DocumentTermsService } from "../document-terms/document-terms.service";
import { openingConsentState } from "./job-opening-signature.service";
import { JobBillingStepService } from "./job-billing-step.service";
import {
  addressLine,
  numberedTerms,
  printChecklist,
  printFindings,
  signatureBoxes,
  technicianSignOff,
  textLines,
} from "./job-print.logic";
import { isWarrantyJob } from "./job-stage.logic";
import { previousVisits } from "./job-stage.service";

const person = { select: { firstName: true, lastName: true } } as const;
const fullName = (user: { firstName: string; lastName: string } | null | undefined) => (user ? `${user.firstName} ${user.lastName}`.trim() || null : null);

const vehicleSelect = {
  make: true,
  model: true,
  year: true,
  color: true,
  registrationNumber: true,
  vin: true,
  engineNumber: true,
  sellingDealer: true,
  saleDate: true,
} satisfies Prisma.VehicleSelect;

const customerSelect = {
  companyName: true,
  firstName: true,
  lastName: true,
  phoneNumber: true,
  address: true,
  house: true,
  street: true,
  city: true,
  state: true,
} satisfies Prisma.CustomerSelect;

type PrintCustomer = Prisma.CustomerGetPayload<{ select: typeof customerSelect }>;
const customerName = (customer: PrintCustomer | null) =>
  customer ? customer.companyName?.trim() || `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() || null : null;

/**
 * The printed job card (A4, front and back) and the gate pass (A6), job card revamp phase 11.
 * Read only: an explicit projection of the stored job, never the repository object.
 */
export class JobPrintService {
  private readonly billing = new JobBillingStepService();
  private readonly terms = new DocumentTermsService();

  /** Everything on the paper form's front, plus the JOB_CARD terms for the back. */
  async jobCard(jobId: string) {
    const job = await prisma.jobCard.findUnique({
      where: { id: jobId },
      include: {
        branch: { select: { name: true, address: true, phoneNumber: true } },
        customer: { select: customerSelect },
        vehicle: { select: vehicleSelect },
        serviceAdvisor: person,
        technician: person,
        complaints: { select: { id: true, description: true }, orderBy: { id: "asc" } },
        checkIn: true,
        damageMarks: { select: { id: true, type: true, x: true, y: true, note: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        diagnosis: { select: { allocationNote: true, confirmedAt: true, confirmedBy: person } },
        findings: { select: { causeAndDefect: true, raisedDuringRepair: true, complaintId: true, createdAt: true } },
        stageEvents: { where: { action: "SEND_TO_QC" }, select: { action: true, createdAt: true, actor: person } },
        inspections: {
          where: { supersededAt: null, result: "PASSED" },
          select: { certifiedAt: true, certifiedBy: person, signature: { select: { signatureImage: true, signedAt: true } } },
          take: 1,
        },
        deliverySignature: { select: { signerName: true, signedAt: true, signatureImage: true } },
        warrantyCase: { select: { id: true } },
        openingSignatures: { orderBy: { revision: "desc" }, take: 1 },
      },
    });
    if (!job) throw new NotFoundError("Job card not found");
    if (job.jobType === JobCardType.PDI) throw new ConflictError("PDI jobs are printed from the PDI screens, not as a service job card.").withCode("JOB_PRINT_PDI");

    const opening = job.openingSignatures[0] ?? null;
    // The same consent check as the check-in gates: does the latest signature still match the job?
    const consent = opening ? await openingConsentState(prisma, job.id) : null;
    const inspection = job.inspections[0] ?? null;
    const requestIndex = new Map(job.complaints.map((complaint, index) => [complaint.id, index]));
    const [company, terms, comparison, visits] = await Promise.all([
      getCompanyProfile(),
      this.terms.effective("JOB_CARD", job.branchId),
      this.billing.comparison(job.id),
      previousVisits(prisma, job),
    ]);

    return {
      company: { name: company.name },
      branch: { name: job.branch.name, address: job.branch.address ?? null, phone: job.branch.phoneNumber ?? null },
      job: {
        id: job.id,
        number: job.jobNumber,
        openedAt: job.createdAt,
        mileage: job.mileage,
        warranty: isWarrantyJob(job.warrantyStatusAtCreation, !!job.warrantyCase),
        advisor: fullName(job.serviceAdvisor),
        promisedAt: job.promisedAt,
        deliveredAt: job.deliveredAt,
        gatePassNumber: job.gatePassNumber,
      },
      customer: job.customer
        ? {
            name: customerName(job.customer),
            phone: job.customer.phoneNumber ?? null,
            address: addressLine([job.customer.address, job.customer.house, job.customer.street, job.customer.city, job.customer.state]),
          }
        : null,
      vehicle: job.vehicle
        ? {
            make: job.vehicle.make,
            model: job.vehicle.model,
            year: job.vehicle.year,
            colour: job.vehicle.color,
            registration: job.vehicle.registrationNumber,
            vin: job.vehicle.vin,
            engineNumber: job.vehicle.engineNumber,
            soldBy: job.vehicle.sellingDealer,
            soldOn: job.vehicle.saleDate,
          }
        : null,
      requests: job.complaints.map((complaint) => complaint.description.trim()).filter(Boolean),
      instructions: {
        advisor: textLines(job.checkIn?.instructionsToTechnician),
        supervisor: textLines(job.diagnosis?.allocationNote),
      },
      damageMarks: job.damageMarks.map((mark) => ({ id: mark.id, type: mark.type, x: Number(mark.x), y: Number(mark.y), note: mark.note })),
      fuelLevel: job.checkIn?.fuelLevel ?? null,
      checklist: printChecklist(job.checkIn?.checklist),
      checklistNote: job.checkIn?.checklistNote ?? null,
      findings: printFindings(
        job.findings.map((finding) => ({
          causeAndDefect: finding.causeAndDefect,
          raisedDuringRepair: finding.raisedDuringRepair,
          requestIndex: finding.complaintId ? (requestIndex.get(finding.complaintId) ?? null) : null,
          createdAt: finding.createdAt,
        })),
      ),
      findingsConfirmed: job.diagnosis?.confirmedAt ? { by: fullName(job.diagnosis.confirmedBy), at: job.diagnosis.confirmedAt } : null,
      roadworthy: inspection?.certifiedAt ? { by: fullName(inspection.certifiedBy), at: inspection.certifiedAt } : null,
      comparison,
      signatures: signatureBoxes({
        advisor: { name: fullName(job.serviceAdvisor), at: job.checkIn?.completedAt ?? null },
        technician: technicianSignOff(
          job.stageEvents.map((event) => ({ action: event.action, actorName: fullName(event.actor), at: event.createdAt })),
          fullName(job.technician),
        ),
        certifier: inspection?.certifiedAt
          ? { name: fullName(inspection.certifiedBy), at: inspection.certifiedAt, image: inspection.signature?.signatureImage ?? null }
          : null,
        authorisation:
          opening && consent && consent !== "legacy" && consent !== "required"
            ? { name: opening.signerName, relationship: opening.relationship, at: opening.signedAt, image: opening.signatureImage, state: consent }
            : null,
        delivery: job.deliverySignature
          ? { name: job.deliverySignature.signerName, relationship: null, at: job.deliverySignature.signedAt, image: job.deliverySignature.signatureImage }
          : null,
      }),
      previousVisits: visits.map((visit) => ({
        jobNumber: visit.jobNumber,
        date: visit.deliveredAt ?? visit.openedAt,
        mileage: visit.mileage,
        // The customer's requests read better than the service type code ("PAID SERVICE").
        work: visit.requests.length ? visit.requests.join(", ") : visit.service,
      })),
      terms: numberedTerms(terms.terms),
      termsFooter: terms.footer,
      printedAt: new Date(),
    };
  }

  /** The A6 gate pass slip, once the vehicle has been delivered. */
  async gatePass(jobId: string) {
    const job = await prisma.jobCard.findUnique({
      where: { id: jobId },
      select: {
        jobNumber: true,
        gatePassNumber: true,
        deliveredAt: true,
        branch: { select: { name: true } },
        customer: { select: customerSelect },
        vehicle: { select: vehicleSelect },
        deliveryAdvisor: person,
        deliverySignature: { select: { signerName: true } },
      },
    });
    if (!job) throw new NotFoundError("Job card not found");
    if (!job.gatePassNumber)
      throw new ConflictError("The gate pass is issued when the vehicle is delivered. Complete the Delivery step first.").withCode("GATE_PASS_NOT_ISSUED");
    const company = await getCompanyProfile();
    return {
      company: { name: company.name },
      branch: { name: job.branch.name },
      jobNumber: job.jobNumber,
      gatePassNumber: job.gatePassNumber,
      registration: job.vehicle?.registrationNumber ?? null,
      vin: job.vehicle?.vin ?? null,
      vehicle: job.vehicle ? { make: job.vehicle.make, model: job.vehicle.model, year: job.vehicle.year, colour: job.vehicle.color } : null,
      customer: customerName(job.customer),
      collectedBy: job.deliverySignature?.signerName ?? null,
      deliveredBy: fullName(job.deliveryAdvisor),
      deliveredAt: job.deliveredAt,
      printedAt: new Date(),
    };
  }
}
