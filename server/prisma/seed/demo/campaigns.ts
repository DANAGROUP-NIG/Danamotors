import prisma from "../../../src/prisma/client";
import { CampaignService } from "../../../src/modules/campaign/campaign.service";
import { DemoContext, Reference, seedLedger } from "./context";
import { Parties } from "./parties";
import { CampaignFixture, DEMO_TAG, VEHICLES } from "./fixtures";
import { daysAgo } from "./retime";

const campaigns = new CampaignService();

/**
 * Creates a campaign through the campaign service: covered models, parts and labour, the
 * affected VINs, activation, and outreach so the VINs show pending, contacted and scheduled.
 * COMPLETED is not set here: it comes from the job card that does the work (JC-01).
 */
export async function seedCampaign(ctx: DemoContext, ref: Reference, parties: Parties, fx: CampaignFixture) {
  const ledgerKey = `${DEMO_TAG}/${fx.code}`;
  const existing = await prisma.campaign.findUnique({ where: { code: fx.code }, select: { id: true } });
  if (existing && (await seedLedger.done(ledgerKey))) return existing.id;

  const actor = ctx.warrantyOfficer.id;
  const startDate = daysAgo(fx.startDaysAgo);
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(startDate.getTime() + fx.durationDays * 86_400_000);
  const covered = fx.vins.find((v) => v.vehicle);
  const baseYear = covered?.vehicle ? parties.vehicles[covered.vehicle].saleYear : new Date().getUTCFullYear();

  const id =
    existing?.id ??
    (
      await campaigns.create(
        {
          code: fx.code,
          title: fx.title,
          type: fx.type,
          description: fx.description,
          defectDescription: fx.defectDescription ?? null,
          startDate,
          endDate,
          labourCovered: true,
          partsCovered: true,
          models: [{ vehicleModelId: ref.warrantyModels[fx.model], yearFrom: baseYear + fx.years[0], yearTo: baseYear + fx.years[1] }],
          coveredItems: fx.coveredItems,
        },
        actor,
      )
    ).id;

  const vinOf = (v: CampaignFixture["vins"][number]) => (v.vehicle ? VEHICLES[v.vehicle].vin : v.vin!);
  await campaigns.addVehicles(id, { vins: fx.vins.map(vinOf) });

  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id } });
  if (fx.status === "ACTIVE" && campaign.status === "DRAFT") {
    await campaigns.activate(id);
    // Activated when it started, not when the seed ran.
    await prisma.campaign.update({ where: { id }, data: { activatedAt: startDate } });
  }

  for (const v of fx.vins) {
    const row = await prisma.campaignVehicle.findUniqueOrThrow({ where: { campaignId_vin: { campaignId: id, vin: vinOf(v) } } });
    if (row.status !== "PENDING") continue;
    if (v.status === "CONTACTED") {
      await campaigns.addContact(id, row.id, { channel: "PHONE", outcome: "REACHED", notes: "Owner informed; will book a visit" }, actor);
    } else if (v.status === "SCHEDULED") {
      // No vehicle record yet, so the visit is booked by phone and marked scheduled by hand.
      await campaigns.updateVehicleStatus(id, [row.id], { status: "SCHEDULED", notes: "Visit booked by phone for next week" });
    }
  }

  await seedLedger.mark(ledgerKey, actor);
  return id;
}
