/**
 * Where the browser tests run. Defaults fit the local Docker Postgres used in development
 * (container dana-jobflow-pg on port 55433); override with the E2E_* variables.
 */
const dbServer = process.env.E2E_DB_SERVER ?? "postgresql://dana:jobflow@localhost:55433";

export const E2E = {
  apiPort: Number(process.env.E2E_API_PORT ?? 5055),
  clientPort: Number(process.env.E2E_CLIENT_PORT ?? 3055),
  get clientUrl() {
    return `http://localhost:${this.clientPort}`;
  },
  /** A database with the base seed and the demo seed, never used directly. */
  templateDb: process.env.E2E_TEMPLATE_DB ?? "dana_demo_p7",
  /** Recreated from the template before every run. */
  db: process.env.E2E_DB ?? "dana_e2e",
  dbServer,
  get databaseUrl() {
    return `${dbServer}/${this.db}`;
  },
};
