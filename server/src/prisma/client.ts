import { Prisma, PrismaClient } from '@prisma/client';
import { config } from '../config';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'stdout', level: 'warn' },
      { emit: 'stdout', level: 'error' },
    ],
});

// Do not log SQL parameters: they may contain personal data or credentials.
if (!global.prisma) {
  (prisma as PrismaClient<Prisma.PrismaClientOptions, 'query'>).$on('query', (event) => {
    if (event.duration >= config.DB_SLOW_QUERY_MS) {
      console.warn(`[db] Slow query: ${event.duration}ms`, event.query);
    } else if (config.DB_QUERY_LOG === 'true') {
      console.debug(`[db] Query: ${event.duration}ms`, event.query);
    }
  });
}

if (config.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
export default prisma;
