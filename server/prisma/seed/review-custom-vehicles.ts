import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.$queryRaw`SELECT lower(btrim("customModel")) AS name, count(*)::integer AS count
FROM "Vehicle" WHERE "modelId" IS NULL AND NULLIF(btrim("customModel"), '') IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC, 1 ASC`
  .then(rows => console.table(rows)).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
