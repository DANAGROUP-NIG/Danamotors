import { Request, Response, NextFunction } from 'express';
import { requisitionActor } from './requisition.controller';
import { ReturnSlipService } from './return-slip.service';
import { listReturnSlipsSchema } from './return-slip.validation';

export class ReturnSlipController {
  private service = new ReturnSlipService();

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.list(listReturnSlipsSchema.parse({ query: req.query }).query, requisitionActor(req));
      res.status(200).json({ status: 'success', statusCode: 200, data: { returnSlips: data } });
    } catch (error) { next(error); }
  };

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.get(req.params.id, requisitionActor(req));
      res.status(200).json({ status: 'success', statusCode: 200, data: { returnSlip: data } });
    } catch (error) { next(error); }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.create(req.body, requisitionActor(req));
      res.status(201).json({ status: 'success', statusCode: 201, data: { returnSlip: data } });
    } catch (error) { next(error); }
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.cancel(req.params.id, req.body.reason, requisitionActor(req));
      res.status(200).json({ status: 'success', statusCode: 200, data: { returnSlip: data } });
    } catch (error) { next(error); }
  };
}
