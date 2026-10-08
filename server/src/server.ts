import app from './app';
import { config } from './config';
import prisma from './prisma/client';
import { checkDatabaseSchema } from './prisma/check-schema';

async function start(): Promise<void> {
  await prisma.$connect();
  await checkDatabaseSchema();
  const server = app.listen(config.PORT, () => {
    console.log(`Dana Motors backend running on port ${config.PORT} in ${config.NODE_ENV} mode`);
  });
  server.on('error', async error => {
    console.error('HTTP server failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
  let shuttingDown = false;
  const gracefulShutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const deadline = setTimeout(() => process.exit(1), 30_000);
    deadline.unref();
    server.close(async () => {
      try {
        await prisma.$disconnect();
        clearTimeout(deadline);
        process.exit(0);
      } catch (error) {
        console.error('Database shutdown failed:', error);
        process.exit(1);
      }
    });
  };
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

start().catch(async error => {
  console.error('Backend startup failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
