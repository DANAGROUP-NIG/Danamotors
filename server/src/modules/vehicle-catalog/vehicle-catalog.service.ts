import prisma from '../../prisma/client';
import { NotFoundError } from '../../shared/errors/appError';

export class VehicleCatalogService {
  async models() {
    const rows = await prisma.vehicleCatalogModel.findMany({
      select: { id: true, name: true, searchName: true, aliases: true, yearStart: true, yearEnd: true, make: { select: { name: true } } },
      orderBy: [{ make: { name: 'asc' } }, { name: 'asc' }],
    });
    return rows.map(row => ({ ...row, make: row.make.name }));
  }
  async options(id: string) {
    const model = await prisma.vehicleCatalogModel.findUnique({ where: { id }, select: {
      id: true,
      generations: { orderBy: [{ yearStart: 'desc' }, { name: 'asc' }, { sourceOrdinal: 'asc' }], select: {
        id: true, name: true, yearStart: true, yearEnd: true,
        engines: { orderBy: [{ label: 'asc' }, { sourceOrdinal: 'asc' }], select: { id: true, label: true, fuelType: true, powerHp: true, transmission: true, drivetrain: true } },
      } },
    } });
    if (!model) throw new NotFoundError('Catalog model not found');
    return model.generations;
  }
}
