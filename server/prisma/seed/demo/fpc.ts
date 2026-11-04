import prisma from "../../../src/prisma/client";
import { CampaignService } from "../../../src/modules/campaign/campaign.service";
import { DemoContext, Reference, seedLedger } from "./context";
import { Parties } from "./parties";
import { DEMO_TAG, FPC_BULLETIN, FPC_JOBS, VEHICLES } from "./fixtures";
import { JobResult, seedJob } from "./jobs";
import { daysAgo } from "./retime";

const campaigns = new CampaignService();

/** Back-dates a vehicle's contacts so they come before its job cards (the "attended but not called" rule). */
async function backdateContacts(campaignVehicleId: string, days: number) {
  const at = daysAgo(days);
  await prisma.campaignContactLog.updateMany({ where: { campaignVehicleId }, data: { createdAt: at } });
  await prisma.campaignVehicle.update({ where: { id: campaignVehicleId }, data: { lastContactAt: at } });
}

/**
 * The FPC bulletin through the app's own services: bulletin fields, a VIN range (which adds
 * the fpc* vehicles), activation, a letter and a phone call, then job cards that record the
 * FPC work as done or not done. Statuses come from the READY transition, not from the seed.
 */
export async function seedFpc(ctx: DemoContext, ref: Reference, parties: Parties, done: Map<string, JobResult>) {
  const fx = FPC_BULLETIN;
  const actor = ctx.warrantyOfficer.id;
  const ledgerKey = `${DEMO_TAG}/${fx.code}`;
  let campaign = await prisma.campaign.findUnique({ where: { code: fx.code }, select: { id: true, status: true } });

  if (!campaign || !(await seedLedger.done(ledgerKey))) {
    const startDate = daysAgo(fx.startDaysAgo);
    startDate.setUTCHours(0, 0, 0, 0);
    const bulletinDate = daysAgo(fx.bulletinDaysAgo);
    bulletinDate.setUTCHours(0, 0, 0, 0);
    campaign ??= await campaigns.create(
      {
        code: fx.code,
        title: fx.title,
        type: "FPC",
        description: fx.description,
        defectDescription: fx.defectDescription,
        bulletinDate,
        jobCardText: fx.jobCardText,
        printOnJobCard: true,
        startDate,
        labourCovered: true,
        partsCovered: true,
      },
      actor,
    );
    const id = campaign.id;
    await campaigns.addVinRanges(id, { ranges: [fx.range] }, actor);
    if (campaign.status === "DRAFT") {
      await campaigns.activate(id);
      await prisma.campaign.update({ where: { id }, data: { activatedAt: startDate } });
    }

    const row = (key: keyof typeof VEHICLES) =>
      prisma.campaignVehicle.findUniqueOrThrow({ where: { campaignId_vin: { campaignId: id, vin: VEHICLES[key].vin } }, include: { _count: { select: { contactLogs: true } } } });
    const letter = await row(fx.letterTo);
    if (letter._count.contactLogs === 0) {
      await campaigns.recordPrintedContacts({ campaignVehicleIds: [letter.id], channel: "LETTER" }, actor);
      await backdateContacts(letter.id, fx.contactDaysAgo);
    }
    const phoned = await row(fx.phoned);
    if (phoned._count.contactLogs === 0) {
      await campaigns.addContact(id, phoned.id, { channel: "PHONE", outcome: "REACHED", notes: "Owner informed; will bring the car in" }, actor);
      await backdateContacts(phoned.id, fx.contactDaysAgo);
    }
    await seedLedger.mark(ledgerKey, actor);
  }

  for (const job of FPC_JOBS) {
    process.stdout.write(`  ${job.id} ... `);
    const result = await seedJob(ctx, ref, parties, job, done);
    done.set(job.id, result);
    console.log(`job card ${result.jobNumber}`);
  }
}
