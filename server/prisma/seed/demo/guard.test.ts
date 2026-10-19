import { assertDemoBranch, assertDemoTarget } from "./guard";
import { needsRetime } from "./retime";

const url = (database: string) => `postgresql://user:secret@db.example.com:5432/${database}`;

describe("assertDemoTarget", () => {
  it("accepts a database named as a demo database, even in production mode", () => {
    expect(assertDemoTarget({ databaseUrl: url("danagroup_danamotors_demo"), nodeEnv: "production" })).toEqual({ host: "db.example.com", database: "danagroup_danamotors_demo" });
  });

  it("refuses production-looking names, whatever the flags", () => {
    for (const database of ["danamotors_prod", "danamotors_production", "live_db", "demo_prod_copy"]) {
      expect(() => assertDemoTarget({ databaseUrl: url(database), nodeEnv: "development", allowDatabase: database })).toThrow(/production/);
    }
  });

  it("requires --allow-database with the exact name for any other database", () => {
    expect(() => assertDemoTarget({ databaseUrl: url("danagroup_danamotors_dev"), nodeEnv: "development" })).toThrow(/--allow-database=danagroup_danamotors_dev/);
    expect(() => assertDemoTarget({ databaseUrl: url("danagroup_danamotors_dev"), nodeEnv: "development", allowDatabase: "danagroup_danamotors" })).toThrow(/not a demo database/);
    expect(assertDemoTarget({ databaseUrl: url("danagroup_danamotors_dev"), nodeEnv: "development", allowDatabase: "danagroup_danamotors_dev" }).database).toBe("danagroup_danamotors_dev");
  });

  it("never seeds a non-demo database in production mode, even with the flag", () => {
    expect(() => assertDemoTarget({ databaseUrl: url("danamotors"), nodeEnv: "production", allowDatabase: "danamotors" })).toThrow(/NODE_ENV=production/);
  });

  it("rejects a missing or malformed connection string", () => {
    expect(() => assertDemoTarget({ databaseUrl: undefined, nodeEnv: "development" })).toThrow(/not set/);
    expect(() => assertDemoTarget({ databaseUrl: "not a url", nodeEnv: "development" })).toThrow(/valid/);
    expect(() => assertDemoTarget({ databaseUrl: "postgresql://localhost:5432/", nodeEnv: "development" })).toThrow(/does not name/);
  });

  it("never echoes the password", () => {
    try {
      assertDemoTarget({ databaseUrl: url("danamotors"), nodeEnv: "development" });
    } catch (error) {
      expect(String(error)).not.toContain("secret");
    }
  });
});

describe("assertDemoBranch", () => {
  it("refuses the production-only stores CPD, Kia Plaza and VI", () => {
    for (const branch of [{ name: "CPD", code: null }, { name: "Central Parts Department", code: null }, { name: "Kia Plaza", code: null }, { name: "VI", code: null }, { name: "Victoria Island", code: null }, { name: "Store", code: "DH" }, { name: "Mainstore", code: "a" }]) {
      expect(() => assertDemoBranch(branch)).toThrow(/production store/);
    }
  });

  it("accepts the demo branches", () => {
    expect(() => assertDemoBranch({ name: "Main Branch", code: null })).not.toThrow();
    expect(() => assertDemoBranch({ name: "Abuja Branch", code: "ABJ" })).not.toThrow();
  });
});

describe("needsRetime", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  const window = { startDaysAgo: 12, spanHours: 52 };

  it("re-dates a job created during this run", () => {
    expect(needsRetime(new Date("2026-10-19T11:59:00Z"), window, now)).toBe(true);
  });

  it("does not re-date a job already moved into its window, even on a later run", () => {
    const retimed = new Date("2026-10-07T12:00:00Z");
    expect(needsRetime(retimed, window, now)).toBe(false);
    expect(needsRetime(retimed, window, new Date("2026-12-01T12:00:00Z"))).toBe(false);
  });

  it("leaves jobs dated today alone", () => {
    expect(needsRetime(now, { startDaysAgo: 0, spanHours: 0 }, now)).toBe(false);
  });
});
