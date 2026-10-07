import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';
import { serviceTypeSettingBody, updateSettingSchema, listSettingsSchema } from './service-type.validation';
import { adminSettingSelect, EligibleServiceRow, loadEligibleServiceTypes, ServiceTypeDb } from './service-type.repository';

type PricedSetting = { serviceCharge: number; previousCharge: number | null; effectiveFrom: Date | null };
export function effectiveServiceCharge(setting: PricedSetting, date: Date): number {
  return setting.effectiveFrom && date < setting.effectiveFrom && setting.previousCharge !== null
    ? setting.previousCharge : setting.serviceCharge;
}

function toOption(row: EligibleServiceRow, date: Date) {
  return {
    id: row.id!, code: row.code!, description: row.description!, chargedTo: row.chargedTo!,
    displayOrder: row.displayOrder,
    serviceCharge: effectiveServiceCharge({ ...row, serviceCharge: row.serviceCharge! }, date),
  };
}

export class ServiceTypeService {
  async options(vehicleId: string, date = new Date(), db: ServiceTypeDb = prisma) {
    const rows = await loadEligibleServiceTypes(vehicleId, db);
    if (!rows.length) throw new NotFoundError('Vehicle not found');
    const vehicleName = [rows[0].vehicleMake, rows[0].vehicleModel].filter(Boolean).join(' ');
    if (!rows[0].modelId) return {
      items: [], reason: 'MODEL_NOT_CONFIGURED' as const,
      message: vehicleName
        ? `No workshop service model is configured for ${vehicleName}. Add the matching workshop MODEL and its per-model service settings.`
        : 'Vehicle has no model set; update the vehicle first',
    };
    const settings = rows.filter(row => row.id !== null);
    return {
      items: settings.map(setting => toOption(setting, date)),
      reason: settings.length ? 'READY' as const : 'NO_SERVICE_SETTINGS' as const,
      message: settings.length ? null : `No active service settings are configured for ${vehicleName || 'this vehicle model'}. Configure the model charges in Workshop masters → Service type.`,
    };
  }

  async requireAvailable(db: ServiceTypeDb, vehicleId: string, serviceTypeId: string, date: Date) {
    const rows = await loadEligibleServiceTypes(vehicleId, db, serviceTypeId);
    if (!rows.length) throw new NotFoundError('Vehicle not found');
    if (!rows[0].id) throw new BadRequestError('Service type not available for this vehicle model');
    return toOption(rows[0], date);
  }

  async listSettings(query: z.infer<typeof listSettingsSchema>['query']) {
    const where = { serviceTypeId: query.serviceTypeId };
    const [items, total] = await Promise.all([
      prisma.serviceTypeModelSetting.findMany({ where, select: adminSettingSelect,
        orderBy: [{ model: { code: 'asc' } }, { id: 'asc' }],
        take: query.limit, skip: (query.page - 1) * query.limit }),
      prisma.serviceTypeModelSetting.count({ where }),
    ]);
    return { items, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } };
  }

  private async validateMasters(db: ServiceTypeDb, serviceTypeId: string, modelId: string) {
    const masters = await db.workshopMaster.findMany({
      where: { id: { in: [serviceTypeId, modelId] }, active: true }, select: { id: true, kind: true, code: true },
    });
    if (!masters.some(master => master.id === serviceTypeId && master.kind === 'SERVICE_TYPE' && master.code !== 'AF') ||
        !masters.some(master => master.id === modelId && master.kind === 'MODEL')) {
      throw new BadRequestError('Select an active service type and workshop model');
    }
  }

  async createSetting(data: z.infer<typeof serviceTypeSettingBody>) {
    try {
      return await prisma.$transaction(async db => {
        await this.validateMasters(db, data.serviceTypeId, data.modelId);
        return db.serviceTypeModelSetting.create({ data: { ...data,
          effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : null }, select: adminSettingSelect });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictError('This service type already has a setting for that model');
      throw error;
    }
  }

  async updateSetting(id: string, data: z.infer<typeof updateSettingSchema>['body']) {
    return prisma.$transaction(async db => {
      const existing = await db.serviceTypeModelSetting.findUnique({ where: { id }, select: { serviceTypeId: true, modelId: true } });
      if (!existing) throw new NotFoundError('Service type model setting not found');
      if (data.active !== false) await this.validateMasters(db, existing.serviceTypeId, existing.modelId);
      return db.serviceTypeModelSetting.update({ where: { id }, data: { ...data,
        effectiveFrom: data.effectiveFrom === undefined ? undefined : data.effectiveFrom ? new Date(data.effectiveFrom) : null },
        select: adminSettingSelect });
    });
  }

  async deleteSetting(id: string) {
    const result = await prisma.serviceTypeModelSetting.deleteMany({ where: { id } });
    if (!result.count) throw new NotFoundError('Service type model setting not found');
  }
}
