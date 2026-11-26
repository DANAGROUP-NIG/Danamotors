import {
  DEFAULT_SERVICE_RULE,
  addMonthsDay,
  evaluateServiceHistory,
  resolveServiceRule,
  spanBetween,
  verdictSentence,
  type CountedService,
  type ServiceRule,
} from "./service-history.logic";
import { dayNumberToIso, lagosDayNumber } from "./warranty.logic";

// Noon Lagos time, so the calendar date is unambiguous.
const d = (iso: string) => new Date(`${iso}T11:00:00Z`);
const day = (iso: string) => lagosDayNumber(d(iso));
let seq = 0;
const job = (iso: string, mileage: number | null, label = "2026000001"): CountedService => ({
  id: `s${(seq += 1)}`,
  date: d(iso),
  mileage,
  source: "JOB",
  label,
});
const outside = (iso: string, mileage: number, dealer = "Kia Ikeja"): CountedService => ({
  id: `o${(seq += 1)}`,
  date: d(iso),
  mileage,
  source: "OUTSIDE",
  label: dealer,
});

const run = (services: CountedService[], asOf: string, currentMileage: number | null, rule: ServiceRule = DEFAULT_SERVICE_RULE, sale: string | null = "2025-01-10") =>
  evaluateServiceHistory({ saleDate: sale ? d(sale) : null, asOf: d(asOf), currentMileage, services, rule });

const statuses = (history: ReturnType<typeof run>, year: number) =>
  history.years[year - 1].periods.map((row) => row.status);

describe("calendar helpers", () => {
  it("adds calendar months and keeps the day, or the month's last day", () => {
    expect(dayNumberToIso(addMonthsDay(day("2025-01-10"), 3))).toBe("2025-04-10");
    expect(dayNumberToIso(addMonthsDay(day("2025-01-31"), 1))).toBe("2025-02-28");
    expect(dayNumberToIso(addMonthsDay(day("2024-01-31"), 1))).toBe("2024-02-29");
    expect(dayNumberToIso(addMonthsDay(day("2025-11-30"), 3))).toBe("2026-02-28");
  });

  it("measures a gap in whole months and days", () => {
    expect(spanBetween(day("2025-07-05"), day("2025-11-20"))).toEqual({ days: 138, months: 4, extraDays: 15 });
    expect(spanBetween(day("2025-01-10"), day("2025-04-10"))).toEqual({ days: 90, months: 3, extraDays: 0 });
  });
});

describe("evaluateServiceHistory: worked example (sold 10 Jan 2025, Q3 of year 1 missed)", () => {
  const history = run(
    [job("2025-04-08", 4_200), job("2025-07-05", 8_600), job("2025-11-20", 12_100)],
    "2026-01-15",
    12_900,
  );

  it("finds the one missed service in year 1, quarter 3", () => {
    expect(history.verdict).toEqual({ kind: "IRREGULAR", missedCount: 1, years: [1], where: [{ year: 1, period: 3 }] });
    expect(verdictSentence(history.verdict)).toBe("Service history has 1 missed service in warranty year 1.");
  });

  it("describes the gap: from 5 Jul to 20 Nov, 4 months 15 days and 3,500 km, due by 5 Oct", () => {
    expect(history.missed).toEqual([
      {
        year: 1,
        period: 3,
        dueOn: "2025-10-05",
        reason: "TIME",
        fromDate: "2025-07-05",
        fromSale: false,
        toDate: "2025-11-20",
        gap: { days: 138, months: 4, extraDays: 15 },
        kmGap: 3_500,
      },
    ]);
  });

  it("builds year 1 as four quarters from the sale date, and year 2 in progress", () => {
    expect(history.years.map((row) => [row.year, row.start, row.end, row.current])).toEqual([
      [1, "2025-01-10", "2026-01-09", false],
      [2, "2026-01-10", "2027-01-09", true],
    ]);
    expect(history.years[0].periods.map((row) => [row.start, row.end])).toEqual([
      ["2025-01-10", "2025-04-09"],
      ["2025-04-10", "2025-07-09"],
      ["2025-07-10", "2025-10-09"],
      ["2025-10-10", "2026-01-09"],
    ]);
    expect(statuses(history, 1)).toEqual(["ON_TIME", "ON_TIME", "MISSED", "ON_TIME"]);
    expect(statuses(history, 2)).toEqual(["UPCOMING", "UPCOMING", "UPCOMING", "UPCOMING"]);
    expect(history.years[1].periods[0].dueOn).toBe("2026-02-20");
    expect(history.years[0].missedCount).toBe(1);
  });

  it("shows each service with the time and km since the one before", () => {
    const q4 = history.years[0].periods[3].services[0];
    expect(q4).toMatchObject({ date: "2025-11-20", mileage: 12_100, kmSinceLast: 3_500, sinceLast: { months: 4, extraDays: 15 } });
    expect(history.services[0]).toMatchObject({ date: "2025-04-08", kmSinceLast: 4_200 });
  });

  it("gives the next service due by date or reading", () => {
    expect(history.nextDue).toEqual({ date: "2026-02-20", mileage: 17_100 });
  });
});

describe("evaluateServiceHistory: boundaries", () => {
  it("is on time at exactly 3 months and missed one day later", () => {
    expect(run([job("2025-04-10", 3_000)], "2025-05-01", 3_500).verdict.kind).toBe("REGULAR");
    const late = run([job("2025-04-11", 3_000)], "2025-05-01", 3_500);
    expect(late.verdict).toMatchObject({ kind: "IRREGULAR", missedCount: 1, where: [{ year: 1, period: 1 }] });
    expect(late.missed[0]).toMatchObject({ dueOn: "2025-04-10", fromSale: true, reason: "TIME" });
  });

  it("is on time at exactly 5,000 km and missed at 5,001 km", () => {
    expect(run([job("2025-03-01", 5_000)], "2025-04-01", 5_200).verdict.kind).toBe("REGULAR");
    const over = run([job("2025-03-01", 5_001)], "2025-04-01", 5_200);
    expect(over.verdict).toMatchObject({ kind: "IRREGULAR", missedCount: 1, where: [{ year: 1, period: 1 }] });
    expect(over.missed[0]).toMatchObject({ reason: "DISTANCE", dueOn: "2025-03-01", kmGap: 5_001 });
  });

  it("checks km between services, not from the sale", () => {
    const history = run([job("2025-03-01", 4_000), job("2025-05-01", 9_000), job("2025-06-01", 14_001)], "2025-06-02", 14_050);
    expect(history.missed.map((row) => [row.reason, row.fromDate, row.kmGap])).toEqual([["DISTANCE", "2025-05-01", 5_001]]);
  });

  it("records both limits when a late service was also over the km limit", () => {
    const history = run([job("2025-05-01", 6_000)], "2025-05-02", 6_010);
    expect(history.missed[0]).toMatchObject({ reason: "BOTH", kmGap: 6_000 });
  });
});

describe("evaluateServiceHistory: grace", () => {
  it("allows the grace days after the due date", () => {
    const rule = { ...DEFAULT_SERVICE_RULE, graceDays: 7 };
    expect(run([job("2025-04-17", 3_000)], "2025-05-01", 3_100, rule).verdict.kind).toBe("REGULAR");
    expect(run([job("2025-04-18", 3_000)], "2025-05-01", 3_100, rule).verdict.kind).toBe("IRREGULAR");
  });

  it("allows the grace km above the limit", () => {
    const rule = { ...DEFAULT_SERVICE_RULE, graceKm: 500 };
    expect(run([job("2025-03-01", 5_500)], "2025-03-02", 5_510, rule).verdict.kind).toBe("REGULAR");
    expect(run([job("2025-03-01", 5_501)], "2025-03-02", 5_510, rule).verdict.kind).toBe("IRREGULAR");
  });

  it("uses grace in the next due date", () => {
    const rule = { ...DEFAULT_SERVICE_RULE, graceDays: 5, graceKm: 250 };
    expect(run([job("2025-03-01", 2_000)], "2025-03-02", 2_010, rule).nextDue).toEqual({ date: "2025-06-06", mileage: 7_250 });
  });
});

describe("evaluateServiceHistory: no services", () => {
  it("counts one missed service for every due date passed since the sale", () => {
    const history = run([], "2026-01-10", 9_000);
    expect(history.verdict).toEqual({
      kind: "IRREGULAR",
      missedCount: 3,
      years: [1],
      where: [{ year: 1, period: 1 }, { year: 1, period: 2 }, { year: 1, period: 3 }],
    });
    // The fourth service is due on the day of this visit, so it is not missed yet.
    expect(statuses(history, 1)).toEqual(["MISSED", "MISSED", "MISSED", "NOT_DUE"]);
    expect(history.missed[0]).toMatchObject({ reason: "BOTH", fromSale: true, toDate: null, kmGap: 9_000 });
    expect(history.missed.map((row) => row.dueOn)).toEqual(["2025-04-10", "2025-07-10", "2025-10-10"]);
  });

  it("is regular for a car sold last month with no service yet", () => {
    const history = run([], "2025-02-10", 1_200);
    expect(history.verdict.kind).toBe("REGULAR");
    expect(statuses(history, 1)).toEqual(["UPCOMING", "UPCOMING", "UPCOMING", "UPCOMING"]);
    expect(history.years[0].periods[0].dueOn).toBe("2025-04-10");
    expect(history.services).toEqual([]);
  });
});

describe("evaluateServiceHistory: gaps", () => {
  it("counts a long gap once per due date it passes", () => {
    const history = run([job("2025-04-08", 4_000), job("2026-01-20", 9_000)], "2026-01-21", 9_010);
    expect(history.missed.map((row) => [row.dueOn, row.year, row.period])).toEqual([
      ["2025-07-08", 1, 2],
      ["2025-10-08", 1, 3],
      ["2026-01-08", 1, 4],
    ]);
    expect(history.verdict).toMatchObject({ missedCount: 3, years: [1] });
  });

  it("marks an overdue open gap on the day of this visit", () => {
    const history = run([job("2025-04-08", 4_000)], "2025-08-01", 7_000);
    expect(history.missed).toHaveLength(1);
    expect(history.missed[0]).toMatchObject({ dueOn: "2025-07-08", toDate: null, period: 2 });
  });

  it("marks an open gap over the km limit", () => {
    const history = run([job("2025-04-08", 4_000)], "2025-06-20", 9_500);
    expect(history.missed).toEqual([expect.objectContaining({ reason: "DISTANCE", toDate: null, kmGap: 5_500, year: 1, period: 2 })]);
  });

  it("does not check km across a lower reading (odometer replaced)", () => {
    const history = run([job("2025-03-01", 4_000), job("2025-05-01", 1_500)], "2025-05-02", 1_600);
    expect(history.verdict.kind).toBe("REGULAR");
    expect(history.services[1].kmSinceLast).toBeNull();
  });

  it("checks only the time limit for a service without a reading", () => {
    const history = run([job("2025-03-01", null), job("2025-05-01", 9_000)], "2025-05-02", 9_050);
    expect(history.services[1].kmSinceLast).toBeNull();
    expect(history.verdict.kind).toBe("REGULAR");
  });

  it("ignores services before the sale or after this visit, and counts one per day", () => {
    const history = run(
      [job("2024-12-20", 10), job("2025-03-01", 2_000), job("2025-03-01", 2_000, "2026000002"), job("2025-06-15", 6_000)],
      "2025-04-01",
      2_500,
    );
    expect(history.services.map((row) => row.date)).toEqual(["2025-03-01"]);
  });

  it("counts outside service records like workshop jobs", () => {
    const services = [job("2025-04-08", 4_200), job("2025-07-05", 8_600), outside("2025-10-01", 10_400), job("2025-11-20", 12_100)];
    const history = run(services, "2026-01-15", 12_900);
    expect(history.verdict.kind).toBe("REGULAR");
    expect(history.years[0].periods[2].services[0]).toMatchObject({ source: "OUTSIDE", label: "Kia Ikeja", kmSinceLast: 1_800 });
    expect(statuses(history, 1)).toEqual(["ON_TIME", "ON_TIME", "ON_TIME", "ON_TIME"]);
  });

  it("counts missed services across several years", () => {
    const history = run([job("2025-04-01", 3_000), job("2025-12-01", 7_000), job("2026-03-01", 9_000), job("2026-08-01", 12_000)], "2026-08-02", 12_010);
    expect(history.verdict).toMatchObject({ kind: "IRREGULAR", missedCount: 3, years: [1, 2] });
    expect(verdictSentence(history.verdict)).toBe("Service history has 3 missed services in warranty years 1 and 2.");
  });
});

describe("evaluateServiceHistory: missing data", () => {
  it("cannot check a vehicle with no sale date", () => {
    const history = run([job("2025-04-01", 3_000)], "2025-05-01", 3_500, DEFAULT_SERVICE_RULE, null);
    expect(history.verdict).toEqual({ kind: "INSUFFICIENT_DATA", missing: ["NO_SALE_DATE"] });
    expect(history.years).toEqual([]);
    expect(history.nextDue).toBeNull();
    expect(verdictSentence(history.verdict)).toBe("Service history cannot be checked. No sale date is recorded for this vehicle.");
  });

  it("cannot check a sale date after this visit", () => {
    const history = run([], "2025-01-01", 10);
    expect(history.verdict).toEqual({ kind: "INSUFFICIENT_DATA", missing: ["SALE_DATE_IN_FUTURE"] });
  });

  it("shows the grid but no verdict without this visit's reading", () => {
    const history = run([job("2025-04-01", 3_000)], "2025-05-01", null);
    expect(history.verdict).toEqual({ kind: "INSUFFICIENT_DATA", missing: ["NO_MILEAGE"] });
    expect(history.years).toHaveLength(1);
  });

  it("names every missing fact", () => {
    expect(verdictSentence({ kind: "INSUFFICIENT_DATA", missing: ["NO_SALE_DATE", "NO_MILEAGE"] })).toBe(
      "Service history cannot be checked. No sale date is recorded for this vehicle and No odometer reading is recorded for this visit.",
    );
  });
});

describe("evaluateServiceHistory: Lagos day boundaries", () => {
  it("reads 23:30 UTC as the next day in Lagos", () => {
    const late = { ...job("2025-04-10", 3_000), date: new Date("2025-04-10T23:30:00Z") }; // 11 Apr, 00:30 in Lagos
    const intime = { ...job("2025-04-10", 3_000), date: new Date("2025-04-10T22:59:00Z") }; // 10 Apr, 23:59 in Lagos
    expect(run([late], "2025-05-01", 3_100).verdict.kind).toBe("IRREGULAR");
    expect(run([intime], "2025-05-01", 3_100).verdict.kind).toBe("REGULAR");
  });

  it("starts the warranty on the Lagos date of the sale", () => {
    const history = evaluateServiceHistory({
      saleDate: new Date("2025-01-09T23:30:00Z"), // 10 Jan in Lagos
      asOf: d("2025-02-01"),
      currentMileage: 100,
      services: [],
      rule: DEFAULT_SERVICE_RULE,
    });
    expect(history.saleDate).toBe("2025-01-10");
    expect(history.years[0].periods[0].start).toBe("2025-01-10");
  });
});

describe("rule settings", () => {
  it("uses the model's value where it has one", () => {
    expect(
      resolveServiceRule(DEFAULT_SERVICE_RULE, {
        serviceIntervalMonths: 6,
        serviceIntervalKm: null,
        servicesPerYear: 2,
        serviceGraceKm: null,
        serviceGraceDays: 10,
      }),
    ).toEqual({ intervalMonths: 6, intervalKm: 5000, servicesPerYear: 2, graceKm: 0, graceDays: 10 });
    expect(resolveServiceRule(DEFAULT_SERVICE_RULE, null)).toEqual(DEFAULT_SERVICE_RULE);
  });

  it("splits the year into the configured number of periods", () => {
    const rule = { ...DEFAULT_SERVICE_RULE, intervalMonths: 6, intervalKm: 10_000, servicesPerYear: 2 };
    const history = run([job("2025-07-01", 8_000)], "2025-12-01", 9_000, rule);
    expect(history.years[0].periods.map((row) => [row.start, row.end, row.status])).toEqual([
      ["2025-01-10", "2025-07-09", "ON_TIME"],
      ["2025-07-10", "2026-01-09", "UPCOMING"],
    ]);
    expect(history.verdict.kind).toBe("REGULAR");
  });
});

describe("verdictSentence", () => {
  it("says a regular history plainly", () => {
    expect(verdictSentence({ kind: "REGULAR" })).toBe("Service history is regular. No missed services.");
  });
});
