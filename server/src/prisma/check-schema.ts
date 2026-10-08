import { Prisma } from '@prisma/client';
import prisma from './client';

/** Check the generated client's columns before accepting HTTP traffic. Read-only. */
export async function checkDatabaseSchema(): Promise<void> {
  const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
  `;
  const available = new Set(columns.map(column => `${column.table_name}.${column.column_name}`));
  const missing = Prisma.dmmf.datamodel.models.flatMap(model =>
    model.fields
      .filter(field => field.kind !== 'object')
      .map(field => `${model.dbName ?? model.name}.${field.dbName ?? field.name}`)
      .filter(column => !available.has(column)),
  );
  if (missing.length) {
    throw new Error(
      `Database schema is behind the Prisma client (${missing.length} missing columns): ` +
      `${missing.slice(0, 10).join(', ')}. Run npm run db:prepare in server before restarting.`,
    );
  }
}
