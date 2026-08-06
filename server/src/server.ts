import app from "./app";
import { config } from "./config";
import prisma from "./prisma/client";

const server = app.listen(config.PORT, async () => {
  console.log(
    `🚀 DriveCare backend running on port ${config.PORT} in ${config.NODE_ENV} mode`,
  );

  try {
    // Attempt connection validation
    await prisma.$connect();
    console.log("📦 Database connection successfully established via Prisma");
  } catch (error) {
    console.error("❌ Failed to connect to the database on start:", error);
  }
});

// Handle graceful shutdown
const gracefulShutdown = async () => {
  console.log("Shutting down server gracefully...");
  server.close(async () => {
    console.log("HTTP server closed.");
    await prisma.$disconnect();
    console.log("Database connection disconnected.");
    process.exit(0);
  });
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
