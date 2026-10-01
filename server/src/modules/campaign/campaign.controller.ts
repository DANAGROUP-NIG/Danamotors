import { NextFunction, Request, RequestHandler, Response } from "express";
import { CampaignService } from "./campaign.service";

type Handler = (req: Request, res: Response) => Promise<unknown>;

const handle =
  (fn: Handler): RequestHandler =>
  async (req, res, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

const ok = (res: Response, data: unknown, message?: string, statusCode = 200) =>
  res.status(statusCode).json({ status: "success", statusCode, ...(message && { message }), data });

export class CampaignController {
  private service = new CampaignService();

  summary = handle(async (_req, res) => ok(res, await this.service.summary()));

  list = handle(async (req, res) => ok(res, await this.service.list(req.query as never)));

  get = handle(async (req, res) => ok(res, { campaign: await this.service.get(req.params.id) }));

  create = handle(async (req, res) =>
    ok(res, { campaign: await this.service.create(req.body, req.user!.userId) }, "Campaign created", 201),
  );

  update = handle(async (req, res) => ok(res, { campaign: await this.service.update(req.params.id, req.body) }, "Campaign updated"));

  activate = handle(async (req, res) => ok(res, { campaign: await this.service.activate(req.params.id) }, "Campaign activated"));

  close = handle(async (req, res) => ok(res, { campaign: await this.service.close(req.params.id) }, "Campaign closed"));

  addVehicles = handle(async (req, res) => {
    const result = await this.service.addVehicles(req.params.id, req.body);
    const message = req.body.dryRun ? undefined : `Added ${result.added} vehicle(s)`;
    ok(res, result, message, req.body.dryRun ? 200 : 201);
  });

  listVehicles = handle(async (req, res) => ok(res, await this.service.listVehicles(req.params.id, req.query as never)));

  getVehicle = handle(async (req, res) => ok(res, { vehicle: await this.service.getVehicle(req.params.id, req.params.vehicleId) }));

  updateVehicle = handle(async (req, res) => {
    await this.service.updateVehicleStatus(req.params.id, [req.params.vehicleId], req.body);
    ok(res, { vehicle: await this.service.getVehicle(req.params.id, req.params.vehicleId) }, "Vehicle updated");
  });

  bulkUpdateVehicles = handle(async (req, res) => {
    const { campaignVehicleIds, ...input } = req.body;
    const result = await this.service.updateVehicleStatus(req.params.id, campaignVehicleIds, input);
    ok(res, result, `Updated ${result.updated} vehicle(s)`);
  });

  addContact = handle(async (req, res) =>
    ok(res, { vehicle: await this.service.addContact(req.params.id, req.params.vehicleId, req.body, req.user!.userId) }, "Contact recorded", 201),
  );

  schedule = handle(async (req, res) =>
    ok(res, await this.service.schedule(req.params.id, req.params.vehicleId, req.body, req.user!.userId), "Appointment booked", 201),
  );
}
