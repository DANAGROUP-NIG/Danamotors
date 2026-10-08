jest.mock('./client', () => ({
  __esModule: true,
  default: { $queryRaw: jest.fn() },
}));

import { Prisma } from '@prisma/client';
import prisma from './client';
import { checkDatabaseSchema } from './check-schema';

const columns = Prisma.dmmf.datamodel.models.flatMap(model =>
  model.fields.filter(field => field.kind !== 'object').map(field => ({
    table_name: model.dbName ?? model.name,
    column_name: field.dbName ?? field.name,
  })),
);

it('accepts a database matching the generated client', async () => {
  (prisma.$queryRaw as jest.Mock).mockResolvedValue(columns);
  await expect(checkDatabaseSchema()).resolves.toBeUndefined();
});

it('identifies the missing warranty column before requests are served', async () => {
  (prisma.$queryRaw as jest.Mock).mockResolvedValue(columns.filter(column =>
    !(column.table_name === 'JobCard' && column.column_name === 'warrantyStatusAtCreation'),
  ));
  await expect(checkDatabaseSchema()).rejects.toThrow('JobCard.warrantyStatusAtCreation');
});

it('does not treat an unavailable database as healthy', async () => {
  (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Connection unavailable'));
  await expect(checkDatabaseSchema()).rejects.toThrow('Connection unavailable');
});
