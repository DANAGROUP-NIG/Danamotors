/**
 * Legacy warranty data migration (AutoEnhancer → Dana Motors).
 *
 * Reads CSV exports of the legacy tables and maps them to the new warranty model:
 *   model.csv          → VehicleModel (code, name, warrdays, warrMileage)
 *   vehiclemaster.csv  → Vehicle.saleDate (SaleDate) + Vehicle.vehicleModelId, matched by VIN / ChassisNO
 *   partmast.csv       → SparePart.warrantyApplicable (WTYAPPLICABLE) + warrantyRate (warrrate)
 *   warrcomp.csv / warrdef.csv / warrpos.csv / warrrej.csv → claim code lookups
 *
 * Every file is optional. Dry run by default: nothing is written, a report is produced.
 *
 *   npx ts-node prisma/legacy/warranty-migrate.ts --dir ./legacy-export            # dry run + report
 *   npx ts-node prisma/legacy/warranty-migrate.ts --dir ./legacy-export --apply    # write (idempotent)
 *
 * Options:
 *   --out <dir>        where to write warranty-migration-<timestamp>.{md,json} (default <dir>/report)
 *   --overwrite-dates  replace an existing, different saleDate (default: report as a conflict)
 *
 * Legacy warranty claims (WarrantyHead / WarrantyDetails, 1 record) are not migrated.
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  csvRecords,
  missingColumns,
  modelKey,
  parseLegacyDate,
  parseLegacyFlag,
  parseMoney,
  parsePositiveInt,
  partKey,
  pick,
  type CsvRecord,
} from "../../src/modules/warranty/legacyImport.logic";
import { normalizeVin, vinError } from "../../src/modules/campaign/campaign.logic";

dotenv.config();

const COLUMNS = {
  model: {
    code: ["code", "modelcode", "model_code", "model"],
    name: ["modeldesc", "description", "desc", "modelname", "name"],
    warrantyDays: ["warrdays", "warrantydays", "warr_days"],
    warrantyKm: ["warrmileage", "warrkm", "warrantykm", "warr_mileage"],
  },
  vehicle: {
    vin: ["vin", "chassisno", "chassis_no", "chassis"],
    saleDate: ["saledate", "sale_date", "salesdate", "deliverydate"],
    model: ["model", "modelcode", "model_code"],
  },
  part: {
    partNumber: ["partno", "partnumber", "part_no", "partcode"],
    applicable: ["wtyapplicable", "warrantyapplicable", "wty_applicable"],
    rate: ["warrrate", "warrantyrate", "warr_rate"],
  },
  code: {
    code: ["code", "defcode", "compcode", "poscode", "rejcode", "warrcode"],
    description: ["description", "desc", "defdesc", "compdesc", "posdesc", "rejdesc", "name"],
  },
};

const CODE_FILES = {
  complaint: "warrcomp.csv",
  defect: "warrdef.csv",
  position: "warrpos.csv",
  reject: "warrrej.csv",
} as const;

type Section = {
  file: string;
  present: boolean;
  missingColumns: string[];
  rows: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  notes: string[];
  samples: Record<string, string[]>;
};

const SAMPLE_LIMIT = 50;

function section(file: string): Section {
  return { file, present: false, missingColumns: [], rows: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, notes: [], samples: {} };
}

function sample(s: Section, key: string, value: string) {
  const list = (s.samples[key] ??= []);
  if (list.length < SAMPLE_LIMIT) list.push(value);
}

function count(s: Section, key: string) {
  s.samples[`${key}#count`] = [String(Number(s.samples[`${key}#count`]?.[0] ?? 0) + 1)];
}

function args() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dir = get("--dir");
  if (!dir) {
    console.error("Usage: ts-node prisma/legacy/warranty-migrate.ts --dir <csv folder> [--apply] [--out <dir>] [--overwrite-dates]");
    process.exit(1);
  }
  return {
    dir: path.resolve(dir),
    out: path.resolve(get("--out") ?? path.join(dir, "report")),
    apply: argv.includes("--apply"),
    overwriteDates: argv.includes("--overwrite-dates"),
  };
}

function readCsv(dir: string, file: string): { headers: string[]; records: CsvRecord[] } | null {
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) return null;
  return csvRecords(fs.readFileSync(full, "utf8"));
}

async function main() {
  const opts = args();
  const prisma = new PrismaClient();
  const mode = opts.apply ? "APPLY" : "DRY RUN";
  console.log(`Legacy warranty migration — ${mode}\nSource: ${opts.dir}\nDatabase: ${new URL(process.env.DATABASE_URL ?? "postgresql://unknown").host}\n`);

  const report: Record<string, Section> = {};

  try {
    // ── Models ────────────────────────────────────────────────────────────
    const models = section("model.csv");
    report.models = models;
    const modelCsv = readCsv(opts.dir, models.file);
    const legacyModelToId = new Map<string, string>();
    const existingModels = await prisma.vehicleModel.findMany();
    for (const m of existingModels) legacyModelToId.set(m.code.toUpperCase(), m.id);

    if (modelCsv) {
      models.present = true;
      models.missingColumns = missingColumns(modelCsv.headers, COLUMNS.model);
      for (const r of modelCsv.records) {
        models.rows++;
        const code = pick(r, ...COLUMNS.model.code)?.toUpperCase();
        const name = pick(r, ...COLUMNS.model.name) ?? code;
        if (!code || !name) {
          models.skipped++;
          sample(models, "rows without a code", JSON.stringify(r));
          continue;
        }
        const warrantyDays = parsePositiveInt(pick(r, ...COLUMNS.model.warrantyDays));
        const warrantyKm = parsePositiveInt(pick(r, ...COLUMNS.model.warrantyKm));
        if (!warrantyDays && !warrantyKm) sample(models, "models with no warranty limits (will be UNKNOWN)", code);
        const existing = existingModels.find((m) => m.code.toUpperCase() === code);
        const nameClash = existingModels.find((m) => m.code.toUpperCase() !== code && modelKey(m.name) === modelKey(name) && m.make === "Kia");
        if (!existing && nameClash) {
          models.skipped++;
          sample(models, "name already used by another code", `${code} "${name}" (existing ${nameClash.code})`);
          continue;
        }
        if (existing) {
          const same = existing.warrantyDays === warrantyDays && existing.warrantyKm === warrantyKm;
          if (same) models.unchanged++;
          else {
            models.updated++;
            sample(models, "policy changes", `${code}: ${existing.warrantyDays}d/${existing.warrantyKm}km → ${warrantyDays}d/${warrantyKm}km`);
            if (opts.apply) await prisma.vehicleModel.update({ where: { id: existing.id }, data: { warrantyDays, warrantyKm } });
          }
          continue;
        }
        models.created++;
        if (opts.apply) {
          const created = await prisma.vehicleModel.create({ data: { code, make: "Kia", name: name.trim(), warrantyDays, warrantyKm } });
          legacyModelToId.set(code, created.id);
          existingModels.push(created);
        } else {
          legacyModelToId.set(code, `new:${code}`);
        }
      }
    }

    // ── Claim codes ───────────────────────────────────────────────────────
    for (const [type, file] of Object.entries(CODE_FILES) as [keyof typeof CODE_FILES, string][]) {
      const s = section(file);
      report[`${type}Codes`] = s;
      const csv = readCsv(opts.dir, file);
      if (!csv) continue;
      s.present = true;
      s.missingColumns = missingColumns(csv.headers, COLUMNS.code);
      const delegate = {
        complaint: prisma.warrantyComplaintCode,
        defect: prisma.warrantyDefectCode,
        position: prisma.warrantyPositionCode,
        reject: prisma.warrantyRejectReason,
      }[type] as unknown as {
        findUnique(a: { where: { code: string } }): Promise<{ description: string } | null>;
        upsert(a: { where: { code: string }; update: { description: string }; create: { code: string; description: string } }): Promise<unknown>;
      };
      for (const r of csv.records) {
        s.rows++;
        const code = pick(r, ...COLUMNS.code.code)?.toUpperCase();
        const description = pick(r, ...COLUMNS.code.description);
        if (!code || !description) {
          s.skipped++;
          sample(s, "rows without code or description", JSON.stringify(r));
          continue;
        }
        const existing = await delegate.findUnique({ where: { code } });
        if (existing && existing.description === description) s.unchanged++;
        else if (existing) s.updated++;
        else s.created++;
        if (opts.apply && (!existing || existing.description !== description)) {
          await delegate.upsert({ where: { code }, update: { description }, create: { code, description } });
        }
      }
    }

    // ── Parts ─────────────────────────────────────────────────────────────
    const parts = section("partmast.csv");
    report.parts = parts;
    const partCsv = readCsv(opts.dir, parts.file);
    if (partCsv) {
      parts.present = true;
      parts.missingColumns = missingColumns(partCsv.headers, COLUMNS.part);
      const all = await prisma.sparePart.findMany({ select: { id: true, partNumber: true, warrantyApplicable: true, warrantyRate: true } });
      const byKey = new Map(all.map((p) => [partKey(p.partNumber), p]));
      const updates: { id: string; data: Prisma.SparePartUpdateInput }[] = [];
      for (const r of partCsv.records) {
        parts.rows++;
        const number = pick(r, ...COLUMNS.part.partNumber);
        const applicable = parseLegacyFlag(pick(r, ...COLUMNS.part.applicable));
        const rate = parseMoney(pick(r, ...COLUMNS.part.rate));
        if (!number) {
          parts.skipped++;
          continue;
        }
        const part = byKey.get(partKey(number));
        if (!part) {
          parts.skipped++;
          count(parts, "parts not in Part Master");
          sample(parts, "parts not in Part Master", number);
          continue;
        }
        if (applicable === null) sample(parts, "unrecognised WTYAPPLICABLE values (left unchanged)", `${number}: ${pick(r, ...COLUMNS.part.applicable)}`);
        const data: Prisma.SparePartUpdateInput = {};
        if (applicable !== null && applicable !== part.warrantyApplicable) data.warrantyApplicable = applicable;
        if (rate !== null && rate > 0 && rate !== part.warrantyRate) data.warrantyRate = rate;
        if (Object.keys(data).length === 0) parts.unchanged++;
        else {
          parts.updated++;
          updates.push({ id: part.id, data });
        }
      }
      if (opts.apply) {
        for (let i = 0; i < updates.length; i += 500) {
          await prisma.$transaction(updates.slice(i, i + 500).map((u) => prisma.sparePart.update({ where: { id: u.id }, data: u.data })));
        }
      }
    }

    // ── Vehicles ──────────────────────────────────────────────────────────
    const vehicles = section("vehiclemaster.csv");
    report.vehicles = vehicles;
    const vehicleCsv = readCsv(opts.dir, vehicles.file);
    const appVehicles = await prisma.vehicle.findMany({
      select: { id: true, vin: true, model: true, vehicleModelId: true, saleDate: true, warrantyExpiresAt: true },
    });
    const byVin = new Map(appVehicles.map((v) => [normalizeVin(v.vin), v]));
    const modelsByName = new Map(existingModels.map((m) => [modelKey(m.name), m.id]));
    const seen = new Set<string>();

    if (vehicleCsv) {
      vehicles.present = true;
      vehicles.missingColumns = missingColumns(vehicleCsv.headers, COLUMNS.vehicle);
      const updates: { id: string; data: Prisma.VehicleUncheckedUpdateInput }[] = [];
      for (const r of vehicleCsv.records) {
        vehicles.rows++;
        const rawVin = pick(r, ...COLUMNS.vehicle.vin);
        if (!rawVin) {
          vehicles.skipped++;
          continue;
        }
        const vin = normalizeVin(rawVin);
        const bad = vinError(vin);
        if (bad) {
          count(vehicles, "invalid VINs");
          sample(vehicles, "invalid VINs", `${rawVin} (${bad})`);
        }
        const saleDate = parseLegacyDate(pick(r, ...COLUMNS.vehicle.saleDate));
        const legacyModel = pick(r, ...COLUMNS.vehicle.model)?.toUpperCase() ?? null;
        if (!saleDate) {
          count(vehicles, "no sale date (coverage will be UNKNOWN)");
          sample(vehicles, "no sale date (coverage will be UNKNOWN)", vin);
        }
        const v = byVin.get(vin);
        if (!v) {
          vehicles.skipped++;
          count(vehicles, "not in the new system");
          sample(vehicles, "not in the new system", vin);
          continue;
        }
        seen.add(v.id);
        const data: Prisma.VehicleUncheckedUpdateInput = {};
        if (saleDate) {
          if (!v.saleDate) data.saleDate = saleDate;
          else if (v.saleDate.toISOString().slice(0, 10) !== saleDate.toISOString().slice(0, 10)) {
            count(vehicles, "sale date conflicts");
            sample(vehicles, "sale date conflicts", `${vin}: app ${v.saleDate.toISOString().slice(0, 10)} vs legacy ${saleDate.toISOString().slice(0, 10)}`);
            if (opts.overwriteDates) data.saleDate = saleDate;
          }
        }
        if (!v.vehicleModelId) {
          const modelId = (legacyModel && legacyModelToId.get(legacyModel)) || (v.model ? modelsByName.get(modelKey(v.model)) : undefined);
          if (modelId && !modelId.startsWith("new:")) data.vehicleModelId = modelId;
          else if (modelId) count(vehicles, "will link to a model created by this run");
          else {
            count(vehicles, "no matching model");
            sample(vehicles, "no matching model", `${vin} (${legacyModel ?? v.model ?? "no model"})`);
          }
        }
        // The old free-text expiry is replaced by the calculated one; report large disagreements for review.
        if (v.warrantyExpiresAt && saleDate) {
          sample(vehicles, "old free-text expiry recorded (review; now calculated)", `${vin}: old expiry ${v.warrantyExpiresAt.toISOString().slice(0, 10)}, sale ${saleDate.toISOString().slice(0, 10)}`);
        }
        if (Object.keys(data).length === 0) vehicles.unchanged++;
        else {
          vehicles.updated++;
          updates.push({ id: v.id, data });
        }
      }
      if (opts.apply) {
        for (let i = 0; i < updates.length; i += 500) {
          await prisma.$transaction(updates.slice(i, i + 500).map((u) => prisma.vehicle.update({ where: { id: u.id }, data: u.data })));
        }
      }
      const notInLegacy = appVehicles.filter((v) => !seen.has(v.id));
      vehicles.notes.push(`${notInLegacy.length} vehicle(s) in the new system were not in vehiclemaster.csv.`);
    }

    // Lossy or unmapped legacy data, for sign-off.
    const lossy = [
      "WarrantyHead / WarrantyDetails (legacy claims, 1 record) are not migrated; open cases in the new app are new work.",
      "Vehicle.warrantyProvider / warrantyStatus / warrantyExpiresAt (free text) are superseded by calculated coverage and will be dropped in a follow-up migration.",
      "Job.Mileage history is not imported; each vehicle's odometer starts from its next job card or check-in.",
      "Legacy service-type campaigns (servhead SC, S1–S3, SR, SB) have no affected-vehicle list, so they cannot become targeted campaigns; create campaigns from the manufacturer's VIN lists.",
      "requisitionpartdetail.warranty (N/W/F/G) on historical jobs is not imported; charge types apply to new job cards.",
    ];

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.mkdirSync(opts.out, { recursive: true });
    const json = { mode, source: opts.dir, generatedAt: new Date().toISOString(), sections: report, lossy };
    fs.writeFileSync(path.join(opts.out, `warranty-migration-${stamp}.json`), JSON.stringify(json, null, 2));
    fs.writeFileSync(path.join(opts.out, `warranty-migration-${stamp}.md`), toMarkdown(json));

    console.log("Section            file                 rows  create  update  same  skip");
    for (const [name, s] of Object.entries(report)) {
      console.log(
        `${name.padEnd(18)} ${(s.present ? s.file : `${s.file} (missing)`).padEnd(20)} ${String(s.rows).padStart(5)} ${String(s.created).padStart(7)} ${String(s.updated).padStart(7)} ${String(s.unchanged).padStart(5)} ${String(s.skipped).padStart(5)}`,
      );
      if (s.missingColumns.length) console.log(`   ⚠ missing columns: ${s.missingColumns.join(", ")}`);
    }
    console.log(`\nReport written to ${opts.out}`);
    if (!opts.apply) console.log("Dry run: nothing was written. Re-run with --apply to import.");
  } finally {
    await prisma.$disconnect();
  }
}

function toMarkdown(json: { mode: string; source: string; generatedAt: string; sections: Record<string, Section>; lossy: string[] }) {
  const lines = [
    `# Legacy warranty migration — ${json.mode}`,
    "",
    `Generated ${json.generatedAt} from \`${json.source}\`.`,
    "",
    "| Section | File | Rows | Create | Update | Unchanged | Skipped |",
    "|---|---|---:|---:|---:|---:|---:|",
    ...Object.entries(json.sections).map(
      ([name, s]) => `| ${name} | ${s.present ? s.file : `${s.file} *(not provided)*`} | ${s.rows} | ${s.created} | ${s.updated} | ${s.unchanged} | ${s.skipped} |`,
    ),
    "",
  ];
  for (const [name, s] of Object.entries(json.sections)) {
    const keys = Object.keys(s.samples).filter((k) => !k.endsWith("#count"));
    if (!s.missingColumns.length && !keys.length && !s.notes.length) continue;
    lines.push(`## ${name}`, "");
    if (s.missingColumns.length) lines.push(`**Missing columns:** ${s.missingColumns.join(", ")}`, "");
    for (const note of s.notes) lines.push(`- ${note}`);
    for (const key of keys) {
      const total = s.samples[`${key}#count`]?.[0];
      lines.push("", `### ${key}${total ? ` (${total})` : ""}`, "");
      for (const v of s.samples[key]) lines.push(`- \`${v}\``);
      if (total && Number(total) > s.samples[key].length) lines.push(`- … and ${Number(total) - s.samples[key].length} more (see JSON)`);
    }
    lines.push("");
  }
  lines.push("## Not migrated / lossy", "", ...json.lossy.map((l) => `- ${l}`), "");
  return lines.join("\n");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
