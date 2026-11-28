import prisma from "../../../src/prisma/client";
import type { DemoContext } from "./context";

/**
 * The job card settings the testing guides rely on (doc/job-cards.md, "Settings checklist").
 * Each value is only created where nothing is saved yet, so an administrator's changes survive a re-run.
 */
export const JOB_CARD_SETTINGS = {
  estimationChargeMinimum: "25000.00",
  estimationChargePercent: "10.00",
  storageFreeHours: 48,
  storageDailyRate: "2000.00",
  psfFollowUpDays: 2,
  stageTargetCheckInMinutes: 30,
  stageTargetDiagnosisMinutes: 120,
  stageTargetWarrantyMinutes: 120,
  stageTargetEstimateMinutes: 120,
  stageTargetQualityCheckMinutes: 60,
} as const;

/** The 12 clauses on the back of the paper job card, printed on page 2 of the job card. */
export const JOB_CARD_TERMS = [
  "Vehicle is driven and tested (including test drive outside workshop), repaired and stored at the sole risk, responsibility and liability of the customer. In case of damage due to an accident, repairs shall be carried out under insurance of vehicle.",
  "Unforeseen hindrances that are beyond our control, including for example force majeure, official interventions, strikes and other interruptions to business activities, delays in supply of the goods verifiable ordered in due to time and lockouts that becomes necessary in the course of industrial action, shall justify a reasonable extension of the delivery period. The same shall apply to aforementioned circumstances, if they occur during a delay in delivery that has already.",
  "Customer undertakes to take delivery of the vehicle within 48 hours of advice regarding completion of the work, in the event of delay the Customer shall pay storage charges of ₦2,000/- per day, along with the charges of repairs, spares parts etc.",
  "The Customer shall pay an estimation charges of ₦25,000/- or 10% of the total estimate value, whichever is higher (if the job is not entrusted to us after obtaining the estimate) and agree to pay the same in addition to the storage charges referred in clause 3 above.",
  "Customer shall make payment of all charges before taking delivery of the vehicle. Payment shall be made either in cash or by bank draft. Discount and collection charges as well as interest plus value added tax, are to be borne by the Customer. In the event, settlement of the bill is delayed beyond a period of 7 days, Customer shall be liable to pay interest 24% p.a. on the outstanding bill amount from the date on which the vehicle was ready for delivery until payment is fully realized.",
  "Dana Motors Limited (“DML”) shall exercise lien on the vehicle until all the above mentioned Payment/s are settled best to the satisfaction of DML.",
  "No vehicle shall be delivered without this receipt. Delivery of vehicle shall be affected upon the person whose signature appears on the repair order form (Job Card). In case, if same person is not taking delivery whose signature appears on repair order form, DML shall have full right to verify authenticity of ownership of vehicle.",
  "Customer undertakes to pay for all repairs prior to taking delivery of the vehicle, subsequent reimbursement from insurance company may be made by them directly to the Customer.",
  "Salvage of accident vehicle must be lifted by Customer along with delivery of the vehicle. Salvage not claimed at the time of delivery shall be disposed off by DML as scrap.",
  "Practically it may not be possible to notice and record all the dents, scratches and other damage/s on the vehicle at the time of accepting vehicle and if some noticed during the repairs/servicing, remarks/observations of the workshop in-charge shall be final and binding upon Customer.",
  "Customer must ensure that all personal belongings are removed from the vehicle prior to bring the vehicle to workshop. DML shall not be responsible for any lose/damage claim.",
  "Bank Draft and Pay Order should be drawn in favor of DANA MOTORS LIMITED only.",
];

export async function ensureJobCardSettings(ctx: DemoContext): Promise<string[]> {
  const notes: string[] = [];
  for (const branch of [ctx.branches.main, ctx.branches.second]) {
    const existing = await prisma.branchSettings.findUnique({ where: { branchId: branch.id } });
    if (!existing) {
      await prisma.branchSettings.create({ data: { branchId: branch.id, ...JOB_CARD_SETTINGS } });
      notes.push(`${branch.name}: branch settings created with the job card defaults`);
    } else notes.push(`${branch.name}: branch settings already saved, left as they are`);
  }
  await prisma.warrantySettings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  const terms = await prisma.documentTerms.findFirst({ where: { documentType: "JOB_CARD", branchId: null }, select: { terms: true } });
  if (!terms) {
    await prisma.documentTerms.create({ data: { type: "JOB_CARD", documentType: "JOB_CARD", branchId: null, terms: [...JOB_CARD_TERMS] } });
    notes.push(`Job card terms: the ${JOB_CARD_TERMS.length} clauses created`);
  } else notes.push(`Job card terms: ${terms.terms.length} clauses already saved, left as they are`);
  return notes;
}
